# Spring Properties 파일 리팩터링: 꼬인 설정을 정리하다

## 자꾸 꼬이는 설정 문제

난잡하게 분리된 설정 때문에, 팀원이 환경변수를 추가하거나 특정 설정들을 추가하는 경우 분리를 해놨지만 제 구실을 못하고 꼬이는 경우가 발생했다. 근 일주일 넘는 시간동안 properties에게 고통받다보니 갈아엎어야겠다는 생각이 들었다.

### 실제로 겪은 문제들

**IDE에서 직접 실행할 때**: `spring.profiles.active=local`이 강제 지정되어 있어서, 의도와 다르게 local 프로파일로 실행되는 경우가 발생했다. 특히 local 프로파일의 `ddl-auto` 설정이 `create-drop`이라면, 의도치 않게 개발 DB의 데이터가 모두 사라지는 상황이 발생할 수 있다. (그것이 실제로 일어났다)

**배포 환경에서**: `FastApi.user-service.url=http://localhost:8000`이 하드코딩되어 있어서 배포 환경에서는 FastAPI 서버에 접근할 수 없었다.

**팀원 혼란**: `application.properties`만 보고 "이 프로젝트는 기본적으로 local로 뜨는구나"라고 오해하는 상황이 계속 발생했다. 솔직히 나도 쓰면서 헷갈렸다.

## 기존 설정의 문제점

### application.properties

```properties
spring.application.name=core
spring.profiles.active=local  # 문제의 시작

server.address=0.0.0.0

FastApi.user-service.url=http://localhost:8000  # 하드코딩

# 메일 관련 설정
spring.mail.host=smtp.gmail.com
spring.mail.port=587
spring.mail.properties.mail.smtp.auth=true
spring.mail.properties.mail.smtp.starttls.enable=true

# AWS Actuator settings
management.endpoints.web.exposure.include=health,info
management.endpoint.health.show-details=never

cloud.aws.region.static=ap-northeast-2
cloud.aws.s3.bucket=tio-image-storage-jungle8th
```

**주요 문제점:**

- `spring.profiles.active=local`: 이 설정은 애플리케이션이 항상 local 프로파일로 실행되게 강제해서, 배포 환경에서는 해당 환경에 맞는 프로파일이 활성화되어야 하는데 혼란이 발생하기 쉬운 상황이었다.
  - **혼란 및 잠재적 실수**: 시간이 지나 코드를 볼 때 application.properties만 보고 "이 프로젝트는 기본적으로 local로 뜨는구나"라고 오해할 수 있음
  - **예상치 못한 동작**: 누군가 스크립트를 사용하지 않고 IDE의 실행 버튼이나 gradle bootRun으로 직접 실행하면, dev 프로파일이 아닌 local 프로파일이 적용됨

### application-local.properties

```properties
spring.datasource.url=jdbc:mysql://${host}:${port}/${dbname}?serverTimezone=Asia/Seoul
spring.datasource.username=admin
spring.datasource.password=${DB_PASSWORD}
spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver

# JPA settings (H2용이라고 주석에 써있는데...)
spring.jpa.hibernate.ddl-auto=create-drop
spring.jpa.show-sql=true
spring.jpa.database-platform=org.hibernate.dialect.H2Dialect  # MySQL 쓰면서 H2 Dialect?
spring.jpa.open-in-view=false
spring.jpa.hibernate.format_sql=true

# OAuth configuration
spring.security.oauth2.client.registration.google.client-id=${OAUTH_ID}
spring.security.oauth2.client.registration.google.client-secret=${OAUTH_PASSWORD}
spring.security.oauth2.client.registration.google.scope=email,profile,openid

# 기타 설정들...
```

**가장 큰 문제**: DB 연결은 MySQL(`com.mysql.cj.jdbc.Driver`)을 사용하면서, JPA 설정은 H2 데이터베이스용(`org.hibernate.dialect.H2Dialect`)으로 되어 있었다. 이 둘이 일치하지 않아 애플리케이션 실행 시 오류가 발생했다. RDS 직접 연결을 구현하면서 놓친 부분이었다.

## 리팩터링 방향 설정

**가장 이상적인 방법**은 공통 설정 파일(`application.properties`)에는 어떤 프로파일을 활성화할지 명시하지 않는 것이다. 

그리고 각 환경별(local, dev) 프로파일 파일에는 해당 환경에서만 달라지는 값을 덮어쓰는(`override`) 방식으로 관리한다.

### 환경변수 동작 원리

Spring Boot는 설정을 읽어올 때 정해진 우선순위를 따른다:

1. dev 프로파일이 활성화되면, `application-dev.properties`를 먼저 읽음
2. 이 파일에 `spring.config.import=aws-secretsmanager:...` 설정이 있으므로, Spring은 AWS Secrets Manager에 접근하여 `host, dbname, password` 등의 값을 가져와 환경에 등록한다
3. 그 다음, 공통 설정인 `application.properties`를 읽는다
4. application.properties에 있는 `${host}`, `${password}` 같은 플레이스홀더들은 이미 AWS Secrets Manager를 통해 가져온 값으로 치환된다

## 리팩터링 결과

### Before vs After 비교

**Before (문제가 있던 구조)**
```properties
# application.properties
spring.profiles.active=local  # ❌ 환경 강제 지정
FastApi.user-service.url=http://localhost:8000  # ❌ 하드코딩

# application-local.properties  
spring.jpa.database-platform=org.hibernate.dialect.H2Dialect  # ❌ MySQL과 불일치
spring.jpa.hibernate.ddl-auto=create-drop  # ❌ 데이터 삭제 위험
```

**After (개선된 구조)**
```properties
# application.properties (공통 템플릿)
spring.datasource.url=jdbc:mysql://${host}:${port}/${dbname}?serverTimezone=Asia/Seoul
spring.datasource.username=${username}
spring.datasource.password=${password}

# application-local.properties (로컬 차이점만)
spring.jpa.hibernate.ddl-auto=update
FastApi.user-service.url=http://localhost:8000

# application-dev.properties (배포 차이점만)
spring.config.import=aws-secretsmanager:tio/db/credentials
spring.jpa.hibernate.ddl-auto=none
```

### 1. application.properties (공통 템플릿)

```properties
# 공통 애플리케이션 설정
spring.application.name=core
server.address=0.0.0.0

# 메일 공통 설정
spring.mail.host=smtp.gmail.com
spring.mail.port=587
spring.mail.properties.mail.smtp.auth=true
spring.mail.properties.mail.smtp.starttls.enable=true

# OAuth configuration
spring.security.oauth2.client.registration.google.scope=email,profile,openid

# AWS Actuator settings & S3 공통 설정
management.endpoints.web.exposure.include=health,info
management.endpoint.health.show-details=never
cloud.aws.region.static=ap-northeast-2
cloud.aws.s3.bucket=tio-image-storage-jungle8th

# DB 연결설정
spring.datasource.url=jdbc:mysql://${host}:${port}/${dbname}?serverTimezone=Asia/Seoul
spring.datasource.username=${username}
spring.datasource.password=${password}
spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver

# JPA 공통설정
spring.jpa.show-sql=true
spring.jpa.open-in-view=false
spring.jpa.hibernate.format_sql=true
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQLDialect

#============================ 변수 설정 구간 ============================#
# .env, GitHub Secrets, AWS Secrets Manager에서 주입

# TOSS
payment.toss.secretKey=${TOSS_KEY}

# JWT
spring.jwt.secret=${JWT}

# OAuth
spring.security.oauth2.client.registration.google.client-id=${OAUTH_ID}
spring.security.oauth2.client.registration.google.client-secret=${OAUTH_PASSWORD}

# Email
spring.mail.username=${MAIL_ID}
spring.mail.password=${MAIL_PASSWORD}
email.send=${MAIL_ID}
```

**변경점:**
- `공통 설정`과 `민감 정보 템플릿 역할` 부여
- 기존의 `spring.profiles.active`나 환경 의존적인 `ddl-auto` 같은 설정을 모두 제거
- DB 연결, OAuth, JWT, Mail 등 환경 변수로 주입될 설정을 모아 `${...} 플레이스홀더`로 정의
- MySQL 드라이버와 Dialect를 일치시킴

### 2. application-local.properties (로컬 개발 환경)

```properties
# 로컬 개발환경의 설정. 필요한 설정의 경우 주석해제하면 우선 적용됨.

## H2 Database settings (필요시 주석해제)
#spring.h2.console.enabled=true
#spring.h2.console.path=/h2-console
#spring.datasource.url=jdbc:h2:mem:testdb
#spring.datasource.driver-class-name=org.h2.Driver
#spring.datasource.username=sa
#spring.datasource.password=
#spring.jpa.database-platform=org.hibernate.dialect.H2Dialect

# JPA 설정, 로컬 DB 스키마 삭제 방지, 컬럼 추가만 가능
spring.jpa.hibernate.ddl-auto=update

# AWS & S3 비활성화 (로컬)
spring.cloud.aws.s3.enabled=false
spring.cloud.aws.region.auto=false
spring.cloud.aws.stack.auto=false
cloud.aws.region.static=ap-northeast-2
cloud.aws.credentials.access-key=dummy
cloud.aws.credentials.secret-key=dummy

# Python Fast API 로컬 설정
FastApi.user-service.url=http://localhost:8000
```

**변경점:**
- `local 환경의 차이점`인 `spring.jpa.hibernate.ddl-auto=update`와 `FastApi.user-service.url`, 그리고 AWS 관련 기능 비활성화 설정만 남김
- `create-drop`을 `update`로 변경하여 데이터 삭제 방지
- `H2 관련 설정`을 주석으로 남겨두어, 필요할 때 쉽게 전환할 수 있도록 함

### 3. application-dev.properties (배포 환경)

```properties
# 배포(개발서버) 설정
# AWS Secrets Manager 민감 정보 가져오기
spring.config.import=aws-secretsmanager:tio/db/credentials,aws-secretsmanager:tio/oauth/google,aws-secretsmanager:tio/jwt,aws-secretsmanager:tio/mail,aws-secretsmanager:tio/payments/toss

# springboot devtools 비활성화 (ec2 배포 환경에서는 불필요)
spring.devtools.restart.enabled=false
spring.devtools.livereload.enabled=false

# JPA 설정
# 절대 변경 금지
spring.jpa.hibernate.ddl-auto=none
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQLDialect

# 실제 배포된 FastAPI 서버 주소, 현재는 없음 이후 추가
# FastApi.user-service.url=http://<실제-fastapi-서비스-주소>
```

**변경점:**
- dev 환경의 핵심인 `spring.config.import`와 `ddl-auto=none` 설정만 명시
- 운영환경에서 스키마 변경을 방지하기 위해 `ddl-auto=none` 설정

## CI와 Test 환경 처리

결론부터 말하자면 **독립적으로 관리하는 것이 맞다**. CI와 TEST를 위한 각각의 환경과 변수들을 별도로 등록해주는 방식이다.

CI (`application-ci.properties`)와 Test (`application-test.properties`) 환경은 앞서 이야기한 규칙의 예외이며, 독립적으로 모든 값을 설정하는 것이 올바른 방법이다.

### application-test.properties

```properties
# 테스트 환경은 외부 의존성 없이 독립적으로 동작

# H2 인메모리 데이터베이스
spring.datasource.url=jdbc:h2:mem:testdb
spring.datasource.driver-class-name=org.h2.Driver
spring.datasource.username=sa
spring.datasource.password=
spring.jpa.database-platform=org.hibernate.dialect.H2Dialect

# JPA 테스트 설정
spring.jpa.hibernate.ddl-auto=create-drop
spring.jpa.show-sql=false

# Mock 데이터
spring.jwt.secret=test-jwt-secret-key-for-testing-only
payment.toss.secretKey=test-toss-key
spring.security.oauth2.client.registration.google.client-id=test-client-id
spring.security.oauth2.client.registration.google.client-secret=test-client-secret

# 메일 설정 비활성화
spring.mail.host=localhost
spring.mail.port=25
spring.mail.username=test@example.com
spring.mail.password=test-password

# AWS 기능 완전 비활성화
spring.cloud.aws.s3.enabled=false
spring.cloud.aws.region.auto=false
spring.cloud.aws.stack.auto=false
```

**왜 test는 독립적으로 해야 하나?**
- **test 프로파일의 목적**: 외부 환경(네트워크, 실제 DB, 외부 API)에 의존하지 않고, 오직 코드의 논리적 정확성만을 빠르고 안정적으로 검증하는 것
- **실제 DB 대신 H2 인메모리 DB 사용**: 네트워크 연결 없이 메모리 상에서 DB를 시뮬레이션하여 테스트를 빠르게 실행
- **민감 정보 Mocking**: 실제 키가 아닌 테스트용 가짜 데이터를 사용하여 테스트 환경을 단순화

## 새 팀원을 위한 환경 설정 가이드

### 로컬 개발 환경 설정

```bash
# 1. 저장소 클론
git clone <repository-url>
cd <project-name>

# 2. .env 파일 생성
touch .env
```

**.env 파일 예시:**
```bash
# 로컬 DB 설정
host=localhost
port=3306
dbname=tio_local
username=root
password=your-local-db-password

# JWT 시크릿
JWT=your-local-jwt-secret-key

# OAuth 구글 설정
OAUTH_ID=your-google-oauth-client-id
OAUTH_PASSWORD=your-google-oauth-client-secret

# 메일 설정
MAIL_ID=your-email@gmail.com
MAIL_PASSWORD=your-gmail-app-password

# 토스 결제 테스트키
TOSS_KEY=your-toss-test-secret-key
```

```bash
# 3. 로컬 실행
./gradlew bootRun --args='--spring.profiles.active=local'

# 또는 환경변수로
export SPRING_PROFILES_ACTIVE=local
./gradlew bootRun
```

### 배포는 GitHub Actions 자동화

```bash
# main 브랜치에 푸시하면 자동으로 dev 프로파일로 배포
git push origin main
```

## 검증 체크리스트

리팩터링 후 다음 항목들을 확인하자:

- [ ] **로컬 환경**: `./gradlew bootRun --args='--spring.profiles.active=local'` 실행 시 올바른 DB 연결
- [ ] **테스트 환경**: `./gradlew test` 실행 시 H2 DB로 모든 테스트 통과
- [ ] **CI 환경**: GitHub Actions에서 빌드 및 테스트 성공
- [ ] **배포 환경**: AWS Secrets Manager에서 민감 정보 정상 로드
- [ ] **보안**: `.env` 파일이 `.gitignore`에 포함되어 있는지 확인

## 트러블슈팅 가이드

### 자주 발생하는 문제들

**1. "Cannot determine embedded database driver class"**
```bash
# 해결: H2 의존성 확인
dependencies {
    testImplementation 'com.h2database:h2'
}
```

**2. AWS Secrets Manager 접근 실패**
```bash
# 해결: IAM 권한 확인
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "secretsmanager:GetSecretValue",
            "Resource": "arn:aws:secretsmanager:ap-northeast-2:*:secret:tio/*"
        }
    ]
}
```

**3. 프로파일이 적용되지 않음**
```bash
# 해결: 프로파일 명시적 지정
export SPRING_PROFILES_ACTIVE=local
./gradlew bootRun

# 또는 실행 시 직접 지정
./gradlew bootRun --args='--spring.profiles.active=local'
```

**4. IDE에서 실행할 때 프로파일 설정**

**IntelliJ IDEA:**
1. Run Configuration 편집
2. Program arguments에 `--spring.profiles.active=local` 추가
3. 또는 Environment variables에 `SPRING_PROFILES_ACTIVE=local` 추가

## 보안 고려사항

### 주의사항

- `.env` 파일은 반드시 `.gitignore`에 추가
- 로컬 개발용 더미 키와 실제 운영 키 분리
- AWS Secrets Manager 키 로테이션 주기 설정 (90일 권장)

### 권한 관리

```bash
# .env 파일 권한 설정
chmod 600 .env

# AWS IAM 최소 권한 원칙 적용
# 필요한 Secrets Manager 리소스에만 접근 허용
```

## 결론 (이상적인 분리 방법)

1. **`application.properties` (공통 템플릿)**
   - local, dev, prod 등 실제 외부 서비스와 연동해야 하는 프로파일들을 위한 공통 "틀"을 제공
   - 모든 민감 정보와 환경 의존적인 값들은 `${...}` 플레이스홀더로 남겨둔다

2. **`application-local.properties`, `application-dev.properties` (차이점 명시)**
   - 공통 템플릿을 상속받아, 각 환경에서 달라져야 하는 설정만 덮어씀
   - dev 프로파일은 `spring.config.import`를 통해 AWS Secrets Manager에서 값을 가져오도록 지정

3. **`application-test.properties`, `application-ci.properties` (완전한 독립)**
   - 공통 설정을 상속받는 것이 아니라, 테스트/CI 환경에 필요한 모든 설정을 독립적으로 재정의
   - H2 DB, Mock 데이터, Fallback 값 등 자체적으로 완결된 설정을 가짐

이번 리팩터링을 통해 얻은 핵심 교훈:

- **명확한 역할 분리**: 공통 설정과 환경별 차이점을 명확히 구분
- **환경변수 통일**: 모든 환경에서 동일한 변수명 사용
- **보안 강화**: 민감 정보는 환경변수로 분리하고 적절한 도구 활용
- **팀 협업 개선**: 새 팀원도 쉽게 이해할 수 있는 구조

앞으로는 새로운 설정을 추가할 때도 이 원칙을 따라 일관성 있게 관리할 수 있을 것이다.
