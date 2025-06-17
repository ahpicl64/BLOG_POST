# 크래프톤 정글 학습 13주차: Spring Boot로 CRUD 게시판 API 서버 구축기

## 주요 골자

- 각자 프레임워크 학습 후 포스트 할 수 있는 게시판 만들기

이번 주차 목표는 프레임워크를 사용한 게시판 구현이다. 일단 BE부터 파서 해보자, 라는게 생각임.
BE와 FE를 모두 학습하는 방향으로 잡았고, 각 프레임워크는 **BE: Spring Boot**, **FE: React**로 골자를 잡았다.

프레임워크 학습은 인프런의 김영한님 강의(`실전! 스프링부트 + JPA 활용 1`)를 통해 진행하고, 이번 주차 과제인 게시판 구현은 그와 별개로 직접 부딪혀보며 빠르게 뼈대를 잡아보기로 했다. "배우는 건 배우는 거, 해야 할 건 해야 할 거"라는 느낌으로.

이 포스팅은 Spring Boot로 백엔드 API 서버를 구축하고, 그 과정에서 겪었던 수많은 트러블슈팅과 해결 과정을 모두 기록한 문서다.

## 1. 프로젝트 환경설정

### (1) Spring Initializr 및 의존성

모든 시작은 [Spring Initializr](https://start.spring.io)에서 비롯된다. 프로젝트 설정은 아래와 같이 진행했다.

- **Project**: `Gradle - Groovy`
- **Dependencies**:
  - `Spring Web`: RESTful API와 내장 톰캣 서버 구축의 기본.
  - `Spring Data JPA`: 데이터베이스 작업을 위한 핵심 라이브러리.
  - `Spring Security`: 인증/인가 등 보안 기능을 위해 추가.
  - `H2 Database`: 개발 및 테스트용으로 가볍게 사용할 수 있는 DB.
  - `Lombok`: 반복적인 코드를 줄여주는 라이브러리.
  - `Validation`: 데이터 유효성 검증을 위해 추가.
  - `jjwt`: JWT(JSON Web Token)를 위해 나중에 추가한 라이브러리.

최종적으로 정리된 `build.gradle`의 의존성은 아래와 같다.

```groovy
// build.gradle
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    implementation 'org.springframework.boot:spring-boot-starter-security'
    implementation 'org.springframework.boot:spring-boot-starter-validation'
    
    // JWT 라이브러리
    implementation 'io.jsonwebtoken:jjwt-api:0.11.5'
    runtimeOnly 'io.jsonwebtoken:jjwt-impl:0.11.5'
    runtimeOnly 'io.jsonwebtoken:jjwt-jackson:0.11.5'

    compileOnly 'org.projectlombok:lombok'
    annotationProcessor 'org.projectlombok:lombok'
    
    runtimeOnly 'com.h2database:h2'
    testImplementation 'org.springframework.boot:spring-boot-starter-test'
}
```

### (2) `application.yml` 최종 설정

수많은 연결 오류와 트러블슈팅을 거쳐 최종적으로 완성된 `application.yml` 설정이다.

```yaml
# application.yml
spring:
  # 데이터베이스 설정 (파일 기반, 자동 서버 전환 모드)
  datasource:
    # 파일 모드를 기본으로 하되, 동시 접속 시 자동으로 서버 모드로 전환해주는 Best Practice
    url: jdbc:h2:file:./db/crudBoard;AUTO_SERVER=TRUE
    driver-class-name: org.h2.Driver
    username: sa
    password:

  # JPA 및 Hibernate 설정
  jpa:
    hibernate:
      # 앱 재시작 시 데이터 유지를 위해 update 사용
      ddl-auto: update
    properties:
      hibernate:
        format_sql: true # SQL을 보기 좋게 정렬

  # H2 데이터베이스 콘솔 설정
  h2:
    console:
      enabled: true
      path: /h2-console

# JWT 토큰 설정
jwt:
  secret: your-super-secret-key-for-jwt-token-generation-with-at-least-256-bits-long
  expiration: 86400000 # 24시간

# 로깅 레벨 설정 (SQL 쿼리 및 파라미터 확인용)
logging:
  level:
    org.hibernate.SQL: debug
    org.hibernate.orm.jdbc.bind: trace
```

여기서 가장 중요했던 부분은 `spring.datasource.url` 설정이었다. `tcp` 모드와 `file` 모드의 차이를 몰라 `Connection refused` 오류와 오랫동안 싸웠는데, `;AUTO_SERVER=TRUE` 옵션을 붙여 H2 콘솔 동시 접속 문제를 해결하는 것이 핵심이었다.

## 2. 엔티티와 리포지토리

데이터베이스 테이블과 매핑될 엔티티 클래스와, DB에 접근할 리포지토리 인터페이스를 정의했다.

- **User.java**: 사용자 정보를 담는 엔티티.
- **Post.java**: 게시글 정보를 담는 엔티티.
  - 특히 `User`와의 관계에서, 사용자를 삭제할 때 게시글도 함께 삭제되도록 `@OnDelete(action = OnDeleteAction.CASCADE)` 어노테이션을 추가하여 참조 무결성 문제를 해결했다.

```java
// User.java
@Entity @Table(name = "users")
@Getter @Setter @NoArgsConstructor
@AllArgsConstructor @Builder
public class User {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id;
    @Column(unique=true, nullable=false) String username;
    @Column(nullable=false) String password;
    @Column(nullable=false) String role;
}
```

```java
// Post.java
@Entity @Table(name = "posts")
@Getter @Setter @NoArgsConstructor
@Builder @AllArgsConstructor
public class Post {
    @Id @GeneratedValue Long id;
    String title;
    @Lob String content;

    @ManyToOne(fetch = LAZY)
    @JoinColumn(name = "user_id")
    @OnDelete(action = OnDeleteAction.CASCADE) // 사용자 삭제 시 게시글도 함께 삭제
    private User author;
    
    LocalDateTime createdAt;
    @PrePersist void pre() { createdAt = LocalDateTime.now(); }
}
```

- **UserRepository.java, PostRepository.java**: `JpaRepository`를 상속받아 기본적인 CRUD 기능을 자동으로 구현했다.

```java
// UserRepository.java
public interface UserRepository extends JpaRepository<User,Long> {
    Optional<User> findByUsername(String username);
    boolean existsByUsername(String username);
}
```

## 3. 보안 기능 구현 (Spring Security + JWT)

Stateless한 REST API를 위해 JWT 기반의 인증/인가 시스템을 구축했다.

- **SecurityConfig.java**: `SecurityFilterChain`을 Bean으로 등록하는 최신 방식으로 구현했다. CORS 설정, H2 콘솔 접근 허용, JWT 필터 등록 등의 핵심 보안 설정을 여기서 처리한다.

```java
// SecurityConfig.java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    // ... (생성자)

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable()) // CSRF 보호 비활성화
                .headers(headers -> headers.frameOptions(frameOptions -> frameOptions.sameOrigin())) // H2 콘솔 프레임 허용
                .cors(cors -> cors.configurationSource(corsConfigurationSource())) // CORS 설정
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS)) // 세션 사용 안함
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(toH2Console()).permitAll() // H2 콘솔 접근 허용
                        .requestMatchers("/api/auth/**").permitAll() // 로그인/회원가입 API 접근 허용
                        .anyRequest().authenticated() // 나머지 모든 경로는 인증 필요
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class); // 직접 만든 JWT 필터 추가

        return http.build();
    }
    
    // ... (CorsConfigurationSource, PasswordEncoder Bean 설정)
}
```

- **JwtUtil, JwtAuthenticationFilter, UserDetailsServiceImpl**: JWT 토큰 생성/검증, 요청 헤더에서 토큰을 읽어 인증을 처리하는 필터, 사용자 정보를 불러오는 서비스 등을 구현하여 보안 설정을 완성했다.

## 4. 서비스와 컨트롤러 구현

- **AuthService, PostService**: 회원가입, 로그인, 글 작성 등의 핵심 비즈니스 로직을 담았다.
- **AuthController, PostController**: 클라이언트의 요청을 받는 API 엔드포인트를 구현했다. `@AuthenticationPrincipal`을 사용해 인증된 사용자 정보를 쉽게 가져올 수 있었다.

```java
// AuthController.java
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {
    private final AuthService authService;

    @PostMapping("/signup")
    public ResponseEntity<?> signup(@RequestBody @Valid SignupRequest request) {
        authService.signup(request);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/login")
    public ResponseEntity<JwtResponse> login(@RequestBody @Valid LoginRequest request){
        JwtResponse jwt = authService.login(request);
        return ResponseEntity.ok(jwt);
    }
}
```

```java
// PostController.java
@RestController
@RequestMapping("/api/posts")
@RequiredArgsConstructor
public class PostController {
    private final PostService postService;

    @PostMapping
    public ResponseEntity<Post> create(
            @RequestBody @Validated PostDto dto,
            @AuthenticationPrincipal UserDetails userDetails) {
        Post saved = postService.create(dto, userDetails.getUsername());
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }
}
```

이제 이 API들을 호출하여 실제 게시판 기능을 사용할 수 있는 백엔드 서버가 완성되었다. 다음 단계는 이 API를 활용할 프론트엔드(React)를 구축하는 것이다.

## 더 공부해볼 것

- [ ] 어노테이션 `@` 정리
- [ ] MVC 구조에서 model 데이터가 일반 java와 spring은 어떤 차이가 있는지
- [ ] H2가 다른 RDBMS(MySQL, PostgreSQL)보다 어떤점이 나은지? -> 기술 채택이유
