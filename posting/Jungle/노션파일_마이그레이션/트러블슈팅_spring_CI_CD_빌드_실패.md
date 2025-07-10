# 트러블슈팅) spring CI/CD 빌드 실패

## 문제 상황

- **오류**: PlaceholderResolutionException - Spring Boot 테스트 실패
• **증상**: CI/CD 빌드에서 CoreApplicationTests > contextLoads() 테스트가 지속적으로 실패
• **오류 메시지**: java.lang.IllegalStateException → UnsatisfiedDependencyException → PlaceholderResolutionException

## 문제 진단 과정

### 1단계: 초기 가설 (❌ 틀림)

가설: CI 환경에서 환경변수가 제대로 설정되지 않음
• GitHub Secrets 확인 → JWT가 비어있음 발견
• JWT 값 추가했지만 여전히 실패

### 2단계: 프로파일 설정 문제 의심 (❌ 틀림)

가설: CI에서 local 프로파일을 참조하는 문제
• application.properties에서 spring.profiles.active=${SPRING_PROFILES_ACTIVE:local} 변경
• CI 워크플로우에 SPRING_PROFILES_ACTIVE: ci 환경변수 추가
• application-ci.properties 완전 업데이트
• 여전히 실패

### 3단계: 근본 원인 발견 (✅ 정답)

실제 원인: 테스트 코드에서 @ActiveProfiles("test") 강제 사용

```bash
java
@SpringBootTest
@ActiveProfiles("test")  // ← 이게 문제!
class CoreApplicationTests {
@Test
void contextLoads() { }
}
```

## 🎯 핵심 문제

### 환경변수 우선순위 이해 부족

CI 환경변수: SPRING_PROFILES_ACTIVE=ci
테스트 어노테이션: @ActiveProfiles("test")  ← 더 높은 우선순위!
결과: application-test.properties 사용

### 누락된 환경변수들

application-test.properties에서 다음 설정들이 누락:
• FastApi.user-service.url (WebClientConfig에서 사용)
• payment.toss.secretKey (PaymentService에서 사용)
• cloud.aws.s3.bucket (FileUploadController에서 사용)
• email.send (메일 설정)
• 기타 AWS, OAuth scope 설정들

## 🔧 해결 방법

### 최종 해결책

application-test.properties에 누락된 모든 설정 추가

```bash
# 추가된 주요 설정들

FastApi.user-service.url=http://localhost:8000
payment.toss.secretKey=test-toss-key
cloud.aws.s3.bucket=tio-image-storage-jungle8th
[email.send=test@example.com](mailto:email.send=test@example.com)
spring.security.oauth2.client.registration.google.scope=email,profile,openid

# ... 기타 AWS, Actuator 설정들

### 불필요했던 작업들 (원복함)

- ❌ CI 워크플로우의 SPRING_PROFILES_ACTIVE=ci 설정
• ❌ application.properties의 환경변수 분기 처리
• ❌ application-ci.properties 완전 업데이트
```

## 📚 학습한 교훈

### 1. Spring Boot 프로파일 우선순위

@ActiveProfiles > 환경변수 > application.properties

### 2. 테스트 환경 설정의 중요성

- 테스트 코드가 별도 프로파일을 사용할 수 있음
• @ActiveProfiles 어노테이션 확인 필수

### 3. 환경변수 추적 방법

```bash
# Java 코드에서 환경변수 참조 찾기

grep -r "@Value" src/main/java/
grep -r "\${" src/main/java/

# 테스트 프로파일 설정 확인

grep -r "@ActiveProfiles" src/test/
```

### 4. 체계적인 디버깅 접근

1. 오류 메시지 정확히 분석
2. 환경변수 설정 상태 확인
3. 프로파일 활성화 상태 확인
4. 테스트 코드의 프로파일 설정 확인 ← 핵심!