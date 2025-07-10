# Spring Boot 3.x에서 dotenv 라이브러리 호환성 문제 해결

## 🚨 문제 상황

### 발생한 에러
```bash
org.springframework.util.PlaceholderResolutionException: Could not resolve placeholder 'JWT' in value "${JWT}" <-- "${spring.jwt.secret}"
```


### 증상
- .env 파일에 환경변수가 정의되어 있음에도 불구하고 Spring Boot에서 인식하지 못함
- System.getenv("JWT") 결과가 null로 반환
- 애플리케이션 시작 시 환경변수 관련 Bean 생성 실패

## 🔍 원인 분석

### 1. 환경변수 로딩 상태 확인
```bash
=== Environment Variables Debug ===
JWT: null
OAUTH_ID: null  
MAIL_ID: null
====================================
```

### 2. PropertySource 분석
Spring Boot 시작 시 로드되는 PropertySource 목록:

- systemProperties
- systemEnvironment 
- Config resource 'application-local.properties'
- Config resource 'application.properties'

문제: spring-dotenv PropertySource가 전혀 로드되지 않음

### 3. 근본 원인 확인
- **라이브러리**: me.paulschwarz:spring-dotenv:2.2.0
- **Spring Boot 버전**: 3.5.3
- **호환성 문제**: spring-dotenv 2.2.0이 Spring Boot 3.x와 호환되지 않음

## 🛠️ 해결 과정

### 1단계: DevTools 충돌 가능성 검증
```gradle
// DevTools 비활성화 테스트
// developmentOnly 'org.springframework.boot:spring-boot-devtools'
```
결과: DevTools 비활성화 후에도 동일한 문제 발생 → DevTools 충돌이 원인이 아님

### 2단계: 라이브러리 교체
```gradle
// 기존 (문제 있는 라이브러리)
// implementation 'me.paulschwarz:spring-dotenv:2.2.0'

// 새로운 라이브러리로 교체
implementation 'io.github.cdimascio:java-dotenv:5.2.2'
```

### 3단계: 수동 환경변수 로딩 구현
```java
@SpringBootApplication
public class CoreApplication {
    public static void main(String[] args) {
        // .env 파일 수동 로드
        Dotenv dotenv = Dotenv.configure()
                .directory("./")
                .ignoreIfMalformed()
                .ignoreIfMissing()
                .load();
        
        // 시스템 프로퍼티로 설정
        dotenv.entries().forEach(entry -> {
            System.setProperty(entry.getKey(), entry.getValue());
        });
        
        SpringApplication.run(CoreApplication.class, args);
    }
}
```

## ✅ 해결 결과

### 성공 로그
```bash
JWT Secret received: ~~~~~~ # 테스트코드 출력문 결과
Started CoreApplication in 3.757 seconds
Tomcat started on port 8080 (http)
```


### 정상 작동 확인
- JWT Secret 정상 로드
- OAuth2 설정 정상 인식
- 애플리케이션 완전 시작
- 모든 Bean 정상 생성

## 📋 최종 해결책 정리

### 권장 방법 1: 안정적인 dotenv 라이브러리 사용

```gradle
implementation 'io.github.cdimascio:java-dotenv:5.2.2'


java
// CoreApplication.java에서 수동 로드
Dotenv dotenv = Dotenv.configure()
        .directory("./")
        .ignoreIfMalformed()
        .ignoreIfMissing()
        .load();

dotenv.entries().forEach(entry -> {
    System.setProperty(entry.getKey(), entry.getValue());
});
```


### 권장 방법 2: Properties 파일에 직접 설정 (채택)
```properties
# application-local.properties
spring.jwt.secret=your-base64-encoded-jwt-secret
spring.security.oauth2.client.registration.google.client-id=your-client-id
```

## 🎯 핵심 교훈

1. 호환성 확인 중요성: 라이브러리 버전과 Spring Boot 버전 간 호환성 사전 확인 필요
2. 단계적 디버깅: 환경변수 → PropertySource → 라이브러리 순으로 체계적 분석
3. 대안 준비: 외부 라이브러리 의존도를 줄이고 네이티브 Spring Boot 기능 활용 고려

## 🔗 관련 이슈
- [spring-dotenv GitHub Issues](https://github.com/paulschwarz/spring-dotenv/issues)
- Spring Boot 3.x 마이그레이션 가이드 참조 권장
