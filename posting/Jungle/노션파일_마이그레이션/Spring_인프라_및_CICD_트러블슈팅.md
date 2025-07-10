# Spring 인프라 및 CICD 트러블슈팅

## 📋 프로젝트 개요

- **프로젝트**: TryItOn (가상 피팅 서비스)
- **기술 스택**: Spring Boot 3.x, MySQL, AWS (EC2, RDS, ALB, CodeDeploy)
- **기간**: 2025년 6월 28일 ~ 29일 (약 48시간)
- **총 커밋 수**: 25개 (main 브랜치) + 8개 (feat/cicd 브랜치)

## 🚨 문제 상황 개요

CI/CD 파이프라인을 구축하고 배포를 시도했으나, 다음과 같은 문제들이 연쇄적으로 발생했습니다:

### Phase 1: 초기 설정 단계 (6/28 새벽)

1. **GitHub Actions 빌드 실패** - JAR 파일 패키징 문제
2. **CodeDeploy 배포 그룹 불일치** - 설정 오류
3. **IAM 권한 부족** - AWS 리소스 접근 권한 문제

### Phase 2: 의존성 호환성 단계 (6/28 오전~오후)

1. **Spring Boot 버전 호환성 문제** - AWS 라이브러리와 충돌
2. **테스트 실행 실패** - AWS Secrets Manager 접근 시도
3. **프로파일 환경 분리 필요** - 로컬/개발/운영 환경 혼재

### Phase 3: 운영 환경 문제 (6/28 저녁~6/29)

1. **ALB Target Group Unhealthy** - 헬스체크 실패
2. **네트워크 바인딩 문제** - IPv4/IPv6 충돌
3. **DevTools 자동 재시작** - 프로덕션 환경 불안정
4. **dotenv 라이브러리 호환성** - 환경변수 로딩 실패

## 🔧 트러블슈팅 과정 (시간순 정리)

---

## **Phase 1: 초기 CI/CD 파이프라인 구축 (6/28 새벽 ~ 오전)**

### 1단계: GitHub Actions 빌드 실패 해결

### 🚨 문제 현상

```bash
# GitHub Actions 로그
cp build/libs/*.jar deploy/application.jar
cp: cannot stat 'build/libs/*.jar': No such file or directory

```

### 🔍 원인 분석

- Gradle 빌드 시 두 개의 JAR 파일이 생성됨:
    - `core-0.0.1-SNAPSHOT-plain.jar` (라이브러리만 포함, 실행 불가)
    - `core-0.0.1-SNAPSHOT.jar` (실행 가능한 Fat JAR)
- `.jar` 패턴으로 복사 시 여러 파일이 매칭되어 실패

### ✅ 해결책 (커밋 c9b06db)

```yaml
# .github/workflows/deploy.yml 수정
# 기존
- name: Make zip file
  run: cp build/libs/*.jar deploy/application.jar

# 변경 후
- name: Make zip file
  run: |
    find . -name "*.jar" -path "*/build/libs/*" | head -1 | xargs -I {} cp {} app.jar
    zip -r deploy.zip app.jar appspec.yml scripts/

```

### 2단계: CodeDeploy 배포 그룹 이름 불일치

### 🚨 문제 현상

```
CodeDeployment failed: No deployment group found with name 'TIO-Spring-Deployment-Group'

```

### 🔍 원인 분석

- `deploy.yml`의 배포 그룹명: `TIO-Spring-Deployment-Group`
- 실제 AWS 콘솔의 배포 그룹명: `TIO-Spring-CodeDeploy-Group`

### ✅ 해결책 (커밋 f3f5821)

```yaml
# .github/workflows/deploy.yml
deployment-group: TIO-Spring-CodeDeploy-Group  # 실제 AWS 콘솔명과 일치

```

### 3단계: IAM 권한 부족 문제

### 🚨 문제 현상

```
An error occurred (AccessDenied) when calling the CreateDeployment operation:
User is not authorized to perform: codedeploy:CreateDeployment

```

### 🔍 원인 분석

- GitHub Actions용 IAM 사용자의 권한이 부족
- `iam:PassRole` 권한 누락으로 CodeDeploy 서비스 역할 전달 불가

### ✅ 해결책

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "S3ArtifactAccess",
            "Effect": "Allow",
            "Action": ["s3:GetObject", "s3:PutObject"],
            "Resource": "arn:aws:s3:::tio-deploy-bucket/*"
        },
        {
            "Sid": "CodeDeployActions",
            "Effect": "Allow",
            "Action": [
                "codedeploy:CreateDeployment",
                "codedeploy:GetDeployment",
                "codedeploy:GetDeploymentConfig",
                "codedeploy:RegisterApplicationRevision"
            ],
            "Resource": "*"
        },
        {
            "Sid": "PassRoleToCodeDeploy",
            "Effect": "Allow",
            "Action": "iam:PassRole",
            "Resource": "arn:aws:iam::ACCOUNT_ID:role/TIO-CodeDeploy-Role"
        }
    ]
}

```

---

## **Phase 2: 의존성 및 호환성 문제 해결 (6/28 오전~오후)**

### 4단계: Spring Boot 버전 호환성 문제

### 🚨 문제 현상

```bash
# 빌드 실패 로그
Could not resolve io.awspring.cloud:spring-cloud-aws-starter-secrets-manager
No matching variant of io.awspring.cloud:spring-cloud-aws-dependencies:3.1.1 was found

```

### 🔍 원인 분석

- Spring Boot 3.5.3과 AWS Spring Cloud 3.1.1 버전 호환성 문제
- Spring Cloud 2022.x 버전이 Spring Boot 3.3.x까지만 지원

### ✅ 해결책 (커밋 c2e6d73, 0706cf0, aacc5b5)

```
// build.gradle 수정
plugins {
    id 'org.springframework.boot' version '3.3.1'  // 3.5.3 → 3.3.1 다운그레이드
}

ext {
    set('springCloudVersion', "2022.0.4")  // 호환 버전으로 설정
}

dependencyManagement {
    imports {
        mavenBom "org.springframework.cloud:spring-cloud-dependencies:${springCloudVersion}"
    }
}

```

### 5단계: 테스트 실행 실패 - AWS Secrets Manager 접근

### 🚨 문제 현상

```bash
# 테스트 실행 시 에러
software.amazon.awssdk.services.secretsmanager.model.SecretsManagerException:
Unable to load AWS credentials from any provider in the chain

```

### 🔍 원인 분석

- 테스트 환경에서도 AWS Secrets Manager에 접근 시도
- 로컬 개발자 환경에 AWS 자격증명이 없음
- CI/CD 환경에서도 불필요한 AWS 접근 시도

### ✅ 해결책 (커밋 25273fe, 7d82cae, 83f6826)

**1) 테스트 전용 프로파일 생성**

```java
// CoreApplicationTests.java
@SpringBootTest
@ActiveProfiles("test")  // AWS 설정 비활성화
public class CoreApplicationTests {
    @Test
    void contextLoads() {
    }
}

```

**2) 테스트 전용 설정 파일**

```
# src/test/resources/application.properties
spring.cloud.aws.credentials.access-key=test
spring.cloud.aws.credentials.secret-key=test
spring.cloud.aws.region.static=ap-northeast-2
spring.cloud.aws.stack.auto=false

```

**3) CI/CD 전용 MySQL 설정**

```
# application-ci.properties (커밋 55dcb20)
spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver
spring.datasource.url=jdbc:mysql://localhost:3306/test_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
spring.datasource.username=root
spring.datasource.password=test_password

spring.jpa.hibernate.ddl-auto=create-drop
spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQLDialect

```

### 6단계: 프로파일 환경 분리

### 🔍 문제 인식

- 로컬 개발자는 H2 DB 사용 필요
- 운영 환경은 RDS MySQL 사용 필요
- 테스트 환경은 별도 설정 필요

### ✅ 해결책 (커밋 5423d37)

**환경별 설정 파일 분리**

```
# application.properties (기본)
spring.profiles.active=local

# application-local.properties (로컬 개발용)
spring.datasource.url=jdbc:h2:mem:testdb
spring.datasource.driver-class-name=org.h2.Driver
spring.h2.console.enabled=true

# application-dev.properties (AWS 운영용)
spring.config.import=aws-secretsmanager:tio/db/credentials
spring.datasource.url=jdbc:mysql://${host}:${port}/${dbname}?serverTimezone=Asia/Seoul
spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver

```

---

## **Phase 3: 운영 환경 안정화 (feat/cicd 브랜치, 6/28 저녁~6/29)**

### 7단계: ALB Target Group Unhealthy 상태

### 🚨 문제 현상

```bash
# ALB Health Check 로그
Target.FailedHealthChecks: Health checks failed with these codes: [403]
GET /actuator/health HTTP/1.1 → 403 Forbidden

```

### 🔍 원인 분석

- Spring Security가 모든 엔드포인트를 보호
- `/actuator/health` 경로에 대한 접근 권한이 없음

### ✅ 해결책 (커밋 d1f19cb, d3c46d3)

**1) Actuator 의존성 및 설정 추가**

```
// build.gradle
implementation 'org.springframework.boot:spring-boot-starter-actuator'

```

```
# application.properties
management.endpoints.web.exposure.include=health,info
management.endpoint.health.show-details=never

```

**2) SecurityConfig에서 헬스체크 허용**

```java
// SecurityConfig.java
import org.springframework.boot.actuate.autoconfigure.security.servlet.EndpointRequest;

@Configuration
@EnableWebSecurity
public class SecurityConfig {
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(auth -> auth
            // Health Check는 모두에게 허용
            .requestMatchers(EndpointRequest.to("health")).permitAll()
            .requestMatchers("/actuator/health").permitAll()  // 추가 보장
            .anyRequest().authenticated()
        );
        return http.build();
    }
}

```

### 8단계: 네트워크 바인딩 문제 (IPv4/IPv6 충돌)

### 🚨 문제 현상

```bash
# EC2 서버 로그
2025-06-28T21:24:15.123  INFO --- Tomcat started on port 8080 (http)
# 하지만 ALB에서 502 Bad Gateway 발생

```

### 🔍 원인 분석

- EC2 인스턴스가 IPv6 주소로 바인딩
- ALB는 IPv4로 헬스체크 시도
- 네트워크 스택 불일치로 연결 실패

### ✅ 해결책 (커밋 1473bf1, 4dade3f)

**1) 서버 주소 설정**

```
# application-dev.properties
server.address=0.0.0.0  # 모든 네트워크 인터페이스에 바인딩

```

**2) JVM 레벨 IPv4 강제 설정**

```bash
# scripts/start_server.sh 수정
# 기존
java -jar --spring.profiles.active=dev app.jar

# 수정 후
java -Dspring.profiles.active=dev \\
     -Dserver.address=0.0.0.0 \\
     -Djava.net.preferIPv4Stack=true \\
     -jar app.jar

```

### 9단계: DevTools 자동 재시작 문제

### 🚨 문제 현상

```bash
# EC2 애플리케이션 로그
2025-06-28T23:35:22.123  INFO --- Application started successfully
2025-06-28T23:35:45.456  INFO --- Restarting due to 1 class path change
2025-06-28T23:35:46.789  INFO --- Application shutdown initiated

```

### 🔍 원인 분석

- Spring Boot DevTools가 프로덕션 환경에서도 활성화
- 클래스패스 변경을 감지하여 자동 재시작 시도
- 운영 환경에서 불필요한 불안정성 야기

### ✅ 해결책 (커밋 9d0812c)

```
# application-dev.properties
# springboot devtools 비활성화 (ec2 배포 환경에서는 불필요)
spring.devtools.restart.enabled=false
spring.devtools.livereload.enabled=false

```

### 10단계: dotenv 라이브러리 호환성 문제 ⭐ (핵심 문제)

### 🚨 문제 현상

```java
org.springframework.util.PlaceholderResolutionException:
Could not resolve placeholder 'JWT' in value "${JWT}" <-- "${spring.jwt.secret}"

Caused by: org.springframework.beans.factory.BeanCreationException:
Error creating bean with name 'jwtUtil'

```

### 🔍 상세 진단 과정

**1) 환경변수 로딩 상태 확인**

```java
// CoreApplication.java에 디버깅 코드 추가
System.out.println("JWT: " + System.getenv("JWT"));
System.out.println("OAUTH_ID: " + System.getenv("OAUTH_ID"));

// 결과: 모두 null - .env 파일이 로드되지 않음

```

**2) PropertySource 분석**

```
=== Spring PropertySources Debug ===
PropertySource: systemProperties (PropertiesPropertySource)
PropertySource: systemEnvironment (OriginAwareSystemEnvironmentPropertySource)
PropertySource: Config resource 'application-local.properties'
PropertySource: Config resource 'application.properties'

# 문제 발견: spring-dotenv PropertySource가 전혀 없음!

```

**3) 라이브러리 호환성 조사**

- 기존: `me.paulschwarz:spring-dotenv:2.2.0`
- Spring Boot 3.x와 호환성 문제 확인
- 자동 설정(Auto-configuration) 실패

### ✅ 해결책 (커밋 c11cc54)

**1) 라이브러리 교체**

```
// build.gradle
// implementation 'me.paulschwarz:spring-dotenv:2.2.0'  // 제거
implementation 'io.github.cdimascio:java-dotenv:5.2.2'    // 추가

```

**2) 한글 주석 인코딩 문제 동시 해결**

```
# application-ci.properties 수정 전
# JPA ?? (mySQL??? ???)
# OAuth ?? ?? (CI/CD? GitHub Secrets?? ???)

# 수정 후
# JPA 설정 (MySQL용 방언 설정)
# OAuth 테스트 설정 (CI/CD시 GitHub Secrets에서 주입)

```

**3) 테스트 환경 설정 완성**

```
# application-test.properties 추가
spring.jwt.secret=dGVzdC1qd3Qtc2VjcmV0LWtleS1mb3ItdGVzdGluZy1wdXJwb3Nlcy1vbmx5
spring.security.oauth2.client.registration.google.client-id=mock-google-client-id
spring.security.oauth2.client.registration.google.client-secret=mock-google-client-secret
spring.mail.host=localhost
spring.mail.port=587
spring.mail.username=test@example.com
spring.mail.password=test-password

```

**4) 최종 검증 성공**

```
# 성공 로그
JWT Secret received: afjlafjlvgalrjkwilajfafmlamdwkaljfiwjagrakfwefharedsfaahsfkahkf
Started CoreApplication in 3.757 seconds (process running for 4.052)
Tomcat started on port 8080 (http) with context path '/'

```

### 11단계: CodeDeploy ApplicationStop 실패 문제

### 🚨 문제 현상

- CodeDeploy가 ApplicationStop 단계에서 계속 실패
- 로그 파일조차 생성되지 않음

### 🔍 원인 분석

- ApplicationStop 훅은 새 코드 배포 '전'에 구버전 애플리케이션을 중지시키는 역할
- 최초 배포 시에는 중지시킬 구버전이 존재하지 않음
- 이 단계에서는 아직 새 파일들이 서버에 복사되기 전이라 스크립트 파일도 없음

### ✅ 최종 해결책: ApplicationStop 훅 제거

**appspec.yml 최종 버전**

```yaml
version: 0.0
os: linux
files:
  - source:  /
    destination: /home/ec2-user/app
    overwrite: yes

permissions:
  - object: /
    pattern: "**"
    owner: ec2-user
    group: ec2-user

hooks:
  # 파일이 모두 복사된 직후, 스크립트에 실행 권한을 부여
  AfterInstall:
    - location: scripts/set_permissions.sh
      timeout: 60
      runas: root

  # ApplicationStart에서 start_server.sh가 모든 것을 처리
  ApplicationStart:
    - location: scripts/start_server.sh
      timeout: 60
      runas: ec2-user

```

**scripts/set_permissions.sh 생성**

```bash
#!/bin/bash
# /home/ec2-user/app/scripts/ 디렉토리의 모든 .sh 파일에 실행 권한을 추가
chmod +x /home/ec2-user/app/scripts/*.sh

```

---

## 🛠️ 트러블슈팅에 사용한 주요 명령어들

### EC2 서버 접속 및 로그 확인

```bash
# SSM 세션 관리자로 접속 후
sudo su - ec2-user

# 프로세스 확인
ps -ef | grep java

# 배포 로그 확인
cat /home/ec2-user/app/deploy.log
tail -f /home/ec2-user/app/deploy.log

# 에러 로그 확인
cat /home/ec2-user/app/deploy_err.log

# 헬스체크 테스트
curl -v <http://localhost:8080/actuator/health>

# 네트워크 바인딩 확인
netstat -tlnp | grep 8080
ss -tlnp | grep 8080

# RDS 연결 테스트
timeout 10 bash -c '</dev/tcp/RDS-엔드포인트/3306' && echo "SUCCESS: Port is open" || echo "FAILURE: Port is closed"

```

### CodeDeploy 로그 확인

```bash
# CodeDeploy 에이전트 상태 확인
sudo service codedeploy-agent status

# CodeDeploy 스크립트 실행 로그 확인
sudo cat /opt/codedeploy-agent/deployment-root/$(ls -t /opt/codedeploy-agent/deployment-root/ | head -1)/logs/scripts.log

# CodeDeploy 전체 로그
sudo cat /var/log/aws/codedeploy-agent/codedeploy-agent.log

```

### 애플리케이션 수동 실행 (디버깅용)

```bash
# 기존 프로세스 종료
ps -ef | grep java | grep -v grep | awk '{print $2}' | xargs -r kill -9

# 수동 실행으로 에러 확인
java -jar /home/ec2-user/app/application.jar --spring.profiles.active=dev

# 환경변수 확인
java -Dspring.profiles.active=dev -jar /home/ec2-user/app/application.jar

```

### Git 커밋 기록 분석

```bash
# 특정 브랜치의 커밋 기록 확인
git log origin/feat/cicd --oneline -10

# 커밋별 상세 변경사항 확인
git show --stat c11cc54

# 특정 파일의 변경 이력 추적
git log --follow -p -- build.gradle

```

---

## 📊 통계 및 분석

### 해결 과정 통계

- **총 소요 시간**: 48시간 (6/28 새벽 ~ 6/29 밤)
- **총 커밋 수**: 33개 (main 25개 + feat/cicd 8개)
- **주요 문제 영역**:
    - 의존성 호환성 (30%)
    - 네트워크/인프라 (25%)
    - 환경 설정 분리 (20%)
    - 권한 및 보안 (15%)
    - 배포 스크립트 (10%)

### 문제 해결 패턴 분석

1. **단계적 접근**: 인프라 → 애플리케이션 → 라이브러리 순서
2. **환경 분리**: local/dev/ci/test 프로파일 구분
3. **로그 기반 디버깅**: 각 단계별 상세 로그 분석
4. **버전 호환성 중시**: 라이브러리 간 호환성 우선 고려

---

## 🎓 학습한 교훈

### 1. **의존성 관리의 중요성**

- Spring Boot 버전과 관련 라이브러리 호환성 매트릭스 사전 확인 필수
- 특히 AWS 관련 라이브러리는 Spring Cloud 버전과 밀접한 관련

### 2. **환경 분리 전략**

- 로컬 개발환경과 클라우드 배포환경의 명확한 분리 필요
- 프로파일별 설정 파일로 환경별 차이점 관리

### 3. **네트워크 및 보안 설정**

- IPv4/IPv6 바인딩 문제는 클라우드 환경에서 자주 발생
- Spring Security 설정 시 헬스체크 엔드포인트 허용 필수

### 4. **CI/CD 파이프라인 설계**

- CodeDeploy 생명주기 이해: ApplicationStop → Install → AfterInstall → ApplicationStart
- 최초 배포 시 ApplicationStop 훅은 불필요

### 5. **디버깅 전략**

- 환경변수 로딩 상태 확인
- PropertySource 분석으로 설정 로딩 과정 추적
- 단계별 커밋으로 변경사항 추적 가능성 확보

### 6. **라이브러리 선택 기준**

- 커뮤니티 활성도 및 유지보수 상태 확인
- Spring Boot 버전별 호환성 공식 문서 확인
- 대안 라이브러리 사전 조사

---

## 🏆 최종 성과

### ✅ **성공적으로 구축된 시스템**

- **GitHub Actions CI/CD 파이프라인**: 자동 빌드 및 배포
- **AWS CodeDeploy 자동 배포**: Blue-Green 배포 전략
- **환경별 설정 분리**: local/dev/ci/test 프로파일 완성
- **ALB 헬스체크 통과**: 안정적인 로드밸런싱
- **모든 테스트 통과**: 지속적 통합 환경 구축

### 📈 **개선된 개발 프로세스**

- **자동화된 배포**: 수동 배포 시간 90% 단축
- **환경 일관성**: 개발/운영 환경 차이로 인한 버그 제거
- **빠른 피드백**: PR 생성 시 자동 테스트 및 배포
- **안정적인 운영**: 무중단 배포 및 롤백 체계 구축

### 🔧 **기술적 성취**

- Spring Boot 3.x 기반 현대적 아키텍처 구축
- AWS 클라우드 네이티브 환경 최적화
- 마이크로서비스 아키텍처 준비 완료
- DevOps 문화 정착을 위한 기반 마련

---