# Spring properties 파일 리팩터링
## 자꾸 꼬이는 설정

개발이 진행될 때마다 난잡해진 설정분리때문에, 나중에 팀원이 환경변수를 추가하거나 특정 설정들을 추가하는경우 분리를 해놨지만 제 구실을 못하고 꼬이는 경우가 발생하였다. 

치명적인 경우에는 잘못된 설정을 읽어오거나, 읽어야할 정보가 없는 경우로 인해 Spring 서버가 뻗는 상황이 발생했다.

### application.properties

```bash
spring.application.name=core
spring.profiles.active=local

server.address=0.0.0.0

FastApi.user-service.url=http://localhost:8000

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

- `spring.profiles.active=local`: 이 설정은 애플리케이션이 항상 local 프로파일로 실행되게 강제해서, 배포 환경(dev, prod등)에서는 해당 환경에 맞는 프로파일(dev)이 활성화되어야 한다고한다.
사실 작성당시에는 local 옵션을 강제하고, CI나 DEV 환경에서는 그 해당 프로퍼티를 활성화하는 것을 강제했는데, 혼란이 발생하기 아주 쉬운 상황이었던 것이다.
    - **혼란 및 잠재적 실수**: 시간이 지나 본인이  코드를 볼 때 application.properties만 보고 "아, 이
    프로젝트는 기본적으로 local로 뜨는구나"라고 오해할 수 있음.
     스크립트 파일(CI용 `deploy.yml` 이나, 배포용 `start_server.sh` 등)을 일일이 확인하기 전까지는 정확한 동작 방식을 파악하기 어렵다.
        - 솔직히 나도 쓰면서도 헷갈렸다
    - 예상치 못한 동작: 만약 누군가 스크립트를 사용하지 않고 IDE의 '실행' 버튼이나 gradle bootRun 같은 명령어로 직접 애플리케이션을 실행하면, dev프로파일이 아닌 local 프로파일이 적용됨.
        - 예를들어 만약 local 프로파일의 ddl-auto 설정이 create-drop이라면, 의도치 않게 개발 DB의 데이터가 모두 사라지는 끔찍한 상황이 발생할 수도 있다고한다 (그것이 실제로 일어났습니다.)
    - 명시성 부족: 공통 설정 파일은 어떤 환경에서든 동일하게 적용될 설정만 남겨두어, "이 설정은 공통 값이다"라는 것을 명확히 하는 것이 좋음.
    특정 프로파일을 기본값으로 지정하는 것은 이러한 명시성을 해친다.
- `spring.jpa.hibernate.ddl-auto=update`: 운영 환경에서 update 옵션은 예기치 않은 DB 스키마 변경을 유발하여 데이터 무결성을 해칠 수 있다.
    - 보통 validate (스키마 검증) 또는 none (스키마 관리 안함)으로 설정하고, 스키마 변경은 Flyway나 Liquibase 같은 DB 마이그레이션 도구로 관리하는 것이 안전하다고 한다.
    - 이 설정은 아무 생각없이 쓰다가, 아주 작은 우리 귀여운 DB를 두번이나 날려본 경험이 있어 따로 다뤄보겠다.
- `FastApi.user-service.url=http://localhost:8000`: localhost는 자기 자신을 가리키므로, 배포 환경에서는 FastAPI 서버에 접근할 수 없기 때문에 환경(dev) 프로파일에 맞는 실제 서비스 주소로 변경해야 함.(아직 없다)

### application-local.properties

```bash
spring.datasource.url=jdbc:mysql://${host}:${port}/${dbname}?serverTimezone=Asia/Seoul
spring.datasource.username=admin
spring.datasource.password=${DB_PASSWORD}
spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver

# JPA settings (H2\u00EC\u009A\u00A9)
spring.jpa.hibernate.ddl-auto=create-drop
spring.jpa.show-sql=true
spring.jpa.database-platform=org.hibernate.dialect.H2Dialect
spring.jpa.open-in-view=false
spring.jpa.hibernate.format_sql=true

# OAuth configuration
spring.security.oauth2.client.registration.google.client-id=${OAUTH_ID}
spring.security.oauth2.client.registration.google.client-secret=${OAUTH_PASSWORD}
spring.security.oauth2.client.registration.google.scope=email,profile,openid

# JWT settings
spring.jwt.secret=${JWT}

# Gmail SMTP configuration
spring.mail.username=${MAIL_ID}
spring.mail.password=${MAIL_PASSWORD}
email.send=${MAIL_ID}

# Setting DB
#spring.datasource.url = ${DB_URL}
#spring.datasource.driver-class-name = com.mysql.cj.jdbc.Driver
#spring.datasource.username = ${DB_USERNAME}
#spring.datasource.password = ${DB_PASSWORD}

spring.cloud.aws.s3.enabled=false
spring.cloud.aws.region.auto=false
spring.cloud.aws.stack.auto=false

cloud.aws.region.static=ap-northeast-2
cloud.aws.credentials.access-key=dummy
cloud.aws.credentials.secret-key=dummy

payment.toss.secretKey=${TOSS_KEY}
```

- `application-local.properties` (로컬 개발용)
* `spring.jpa.database-platform=org.hibernate.dialect.H2Dialect`: DB 연결은 MySQL(com.mysql.cj.jdbc.Driver)을 사용하면서, JPA설정은 H2 데이터베이스용으로 되어 있습니다. 이 둘이 일치하지 않아 애플리케이션 실행 시 오류가 발생한다. RDS 직접 연결을 구현하면서 놓친 부분이다.

### application-dev.properties

```bash

server.address=0.0.0.0

spring.config.import=aws-secretsmanager:tio/db/credentials,aws-secretsmanager:tio/oauth/google,aws-secretsmanager:tio/jwt,aws-secretsmanager:tio/mail,aws-secretsmanager:tio/payments/toss

spring.devtools.restart.enabled=false
spring.devtools.livereload.enabled=false

spring.datasource.url=jdbc:mysql://${host}:${port}/${dbname}?serverTimezone=Asia/Seoul
spring.datasource.username=${username}
spring.datasource.password=${password}
spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver

spring.jpa.hibernate.ddl-auto=update
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQLDialect
spring.jpa.show-sql=true

payment.toss.secretKey=${TOSS_KEY}
```

## 리팩토링할 결심

근 일주일 넘는 시간동안 properties에게 고통받다보니 갈아엎긴 해야겠다는 생각이 들었다.

**가장 이상적인 방법**은 공통 설정 파일(`application.properties`)에는 어떤 프로파일을 활성화할지 명시하지 않는 것 이라고한다. 

그리고 각 환경별(local,dev) 프로파일 파일에는 해당 환경에서만 달라지는 값을 덮어쓰는(`override`) 방식으로 관리한다고한다.

## 결과

### application.properties

모든 환경에서 동일하게 적용되는 설정만 남긴다. spring.profiles.active를 제거하고, localhost 같이 특정 환경에 종속적인 URL도 제거하거나 dev프로파일로 옮김.

환경변수 이름을 모든 환경(AWS Secrets Manager, GitHub Secrets, 로컬 `.env`)에서 통일하고, 해당 변수를 사용하는 설정을 `application.properties` 파일 한 곳으로 옮겼다

### 환경변수 동작이 어떻게 되는지?

Spring Boot는 설정을 읽어올 때 정해진 우선순위를 따른다고한다

1. dev 프로파일이 활성화되면, application-dev.properties를 먼저 읽음
2. 이 파일에 spring.config.import=aws-secretsmanager:... 설정이 있으므로, Spring은 `AWS Secrets Manager`에 접근하여 `host, dbname, password 등의 값`을 가져와 환경에 등록한다
3. 그 다음, 공통 설정인 `application.properties`를 읽는다
4. application.properties에 있는 ${host}, ${password} 같은 플레이스홀더들은 이미 AWS Secrets Manager를 통해 가져온 값으로 치환한다

```bash
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

#============================ 변수 설정 구간. .env, github Secret, AWS SecretManager 추가 ============================#
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

변경점

- `공통 설정`과 `민감 정보 템플릿 역할`  부여. 기존의 spring.profiles.active나 환경 의존적인 ddl-auto 같은 설정을 모두 제거
- DB 연결, OAuth, JWT, Mail 등 환경 변수로 주입될 설정을 모아 `${...} 플레이스홀더`로 정의

### application-local.properties

로컬 개발 환경에서만 사용할 설정을 정의하고, 공통 설정에 있는 값을 덮어쓴다

```bash

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

변경점

- `local 환경의 차이점`인 spring.jpa.hibernate.ddl-auto=update와 FastApi.user-service.url, 그리고 AWS 관련 기능 비활성화 설정만 남겨, 중복을 제거하고 파일 목적의 명확화
- `H2 관련 설정`을 주석으로 남겨두어, 필요할 때 쉽게 전환할 수 있도록 함

### application-dev.properties

배포 서버(EC2)에서 사용할 설정을 정의한다

```bash
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

dev 환경의 핵심인 `spring.config.import`와 `ddl-auto=none` 설정만 명시

## CI랑 TEST는?

결론부터 말하자면 그대로 해도 된다. 모든 CI랑 TEST를 위한 각 각의 환경과 변수들을 별도로 등록해주는 방식.

CI (`application-ci.properties`)와 Test (`application-test.properties`) 환경은 앞서 이야기한규칙의 예외이며, 독립적으로모든 값을 설정하는 것이 올바른 방법.

그 이유는 이 두 프로파일이 가지는 명확한 목적성 때문이다

- `test` 프로파일의 목적: 외부 환경(네트워크, 실제 DB, 외부 API)에 의존하지 않고, 오직 코드의 논리적 정확성만을 빠르고 안정적으로 `검증`하는 것
    - **실제 DB 대신 H2 인메모리 DB 사용**: spring.datasource.url=jdbc:h2:mem:testdb 설정은 네트워크 연결 없이 메모리 상에서 DB를 시뮬레이션하여 테스트를 매우 빠르게 실행하고, 각 테스트가 독립적으로 수행되도록 보장
    - 민감 정보 Mocking: spring.jwt.secret=..., payment.toss.secretKey=test-toss-key 처럼 실제 키가 아닌 테스트용 가짜(mock) 데이터를 사용한다
    실제 키를 사용하면 테스트 환경이 복잡해지고 보안에 취약해진다
    - `ddl-auto=create-drop`: 각 테스트 실행 전에 스키마를 깨끗하게 생성하고, 끝나면 삭제하여 다른 테스트에 영향을 주지 않도록 격리
- `ci` 프로파일의 목적: GitHub Actions 같은 CI/CD 서버 환경에서 빌드와 테스트를 자동화하는 것.
이 환경은 개발자의 로컬 환경이나 실제 운영서버와는 완전히 분리된 `제3의 공간`
    - **독자적인 DB 설정**: ci 환경의 Runner(가상머신) 내에 Docker 등으로 테스트용 MySQL을 띄우고,
    spring.datasource.url=jdbc:mysql://localhost:3306/test_db 처럼 접속하여 통합 테스트를 수행한다
    - **GitHub Secrets 또는 Fallback 값 사용**: ${OAUTH_ID:test-client-id} 와 같은 구문은 "GitHub Secrets에 OAUTH_ID가 있으면 그 값을 쓰고, 없으면 test-client-id라는 기본(fallback) 값을 써라"는 의미. 
    CI 환경에서는 이렇게 환경 변수 주입이 실패하더라도 빌드가 깨지지 않도록 만드는 것이 매우 중요하다고한다

## 결론 (이상적인 분리 방법)

1. `application.properties` (공통 템플릿)
    - local, dev, prod 등 실제 외부 서비스와 연동해야 하는 프로파일들을 위한 공통 "틀"을 제공
    - 모든 민감 정보와 환경 의존적인 값들은 ${...} 플레이스홀더로 남겨둔다
2. `application-local.properties`, `application-dev.properties` (차이점 명시)
    - 공통 템플릿을 상속받아, 각 환경에서 달라져야 하는 설정만 덮어씀.
    (예: spring.jpa.hibernate.ddl-auto, FastApi.user-service.url)
    - dev 프로파일은 spring.config.import를 통해 AWS Secrets Manager에서 값을 가져오도록 지정
3. `application-test.properties`, `application-ci.properties` (완전한 독립)
    - 공통 설정을 상속받는 것이 아니라, 테스트/CI 환경에 필요한 모든 설정을 독립적으로 재정의(override)
    - H2 DB, Mock 데이터, Fallback 값 등 자체적으로 완결된(self-contained) 설정을 가짐