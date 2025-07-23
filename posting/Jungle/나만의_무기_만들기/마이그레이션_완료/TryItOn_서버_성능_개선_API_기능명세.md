# TryItOn 서버 성능 개선 API 기능명세 (1)

## 1. 현재 성능 현황 분석

### 1.1 주요 성능 병목 지점

### **데이터베이스 쿼리 최적화 필요**

- **복잡한 JOIN 쿼리**: `TagRepository.findUserFavoriteTags()`에서 5개 테이블 JOIN
- **N+1 문제**: Story 조회 시 author, profile 별도 조회
- **인덱스 부족**: 카테고리 계층 구조, 찜 개수 정렬 등에 인덱스 필요

### **외부 API 호출 병목**

- **FastAPI 서버 호출**: 아바타 생성/피팅 시 외부 서버 의존성
- **동기 블로킹**: `block()` 호출로 인한 스레드 블로킹

### **캐싱 부재**

- **상품 정보**: 자주 조회되는 상품 데이터 캐싱 없음
- **사용자 정보**: JWT 토큰 검증 결과 캐싱 없음
- **카테고리 정보**: 정적 카테고리 데이터 캐싱 없음

### 1.2 현재 API 구조

```
�� 주요 API 엔드포인트
├── /api/products/main (비회원 메인 페이지)
├── /api/home/products (회원 메인 페이지)
├── /api/products/{id} (상품 상세)
├── /api/products/{id}/similar (유사 상품)
├── /api/stories (스토리 목록)
├── /api/avatars/try-on (가상 피팅)
└── /api/cart, /api/orders (장바구니/주문)

```

## 2. 성능 개선 목표

### 2.1 응답 시간 목표

- **메인 페이지**: 200ms 이하
- **상품 상세**: 150ms 이하
- **스토리 목록**: 300ms 이하
- **가상 피팅**: 2초 이하 (외부 API 포함)

### 2.2 처리량 목표

- **동시 사용자**: 1000명 이상
- **RPS (Request Per Second)**: 500 이상
- **데이터베이스 연결**: 50개 풀

## 3. 성능 개선 전략

### 3.1 데이터베이스 최적화

### **인덱스 추가**

```sql
-- 상품 테이블 인덱스
CREATE INDEX idx_product_category_deleted ON product(category_id, deleted);
CREATE INDEX idx_product_wishlist_count ON product(wishlist_count DESC);
CREATE INDEX idx_product_created_at ON product(created_at DESC);

-- 스토리 테이블 인덱스
CREATE INDEX idx_story_like_count_id ON story(like_count DESC, id DESC);
CREATE INDEX idx_story_author_id ON story(author_id);

-- 주문 테이블 인덱스
CREATE INDEX idx_order_user_created ON orders(user_id, created_at DESC);

```

### **쿼리 최적화**

```java
// N+1 문제 해결을 위한 FETCH JOIN
@Query("SELECT s FROM Story s " +
       "LEFT JOIN FETCH s.author a " +
       "LEFT JOIN FETCH a.profile " +
       "WHERE s.id < :currentStoryId " +
       "ORDER BY s.id DESC")
List<Story> findByIdLessThanOrderByIdDesc(Long currentStoryId, Pageable pageable);

```

### 3.2 캐싱 전략

### **Redis 캐싱 구현**

```java
@Service
public class ProductCacheService {

    @Cacheable(value = "products", key = "#productId")
    public ProductDetailResponseDto getProductDetail(Long userId, Long productId) {
        // 기존 로직
    }

    @Cacheable(value = "categories", key = "'all'")
    public List<Category> getAllCategories() {
        return categoryRepository.findAll();
    }
}

```

### **캐시 설정**

```
# Redis 설정
spring.redis.host=localhost
spring.redis.port=6379
spring.cache.type=redis
spring.cache.redis.time-to-live=300000

```

### 3.3 비동기 처리

### **FastAPI 호출 비동기화**

```java
@Service
public class AvatarService {

    public Mono<String> performTryOnAsync(String baseImgUrl, String maskUrl,
                                         String poseUrl, Product garment) {
        return fastApiWebClient.post()
            .uri("/tryon")
            .bodyValue(fastApiRequest)
            .retrieve()
            .bodyToMono(FastApiTryOnResponse.class)
            .map(FastApiTryOnResponse::getTryOnImgUrl)
            .timeout(Duration.ofSeconds(10));
    }
}

```

### 3.4 연결 풀 최적화

### **데이터베이스 연결 풀**

```
# HikariCP 설정
spring.datasource.hikari.maximum-pool-size=50
spring.datasource.hikari.minimum-idle=10
spring.datasource.hikari.connection-timeout=30000
spring.datasource.hikari.idle-timeout=600000
spring.datasource.hikari.max-lifetime=1800000

```

### **HTTP 클라이언트 풀**

```java
@Configuration
public class WebClientConfig {

    @Bean
    public WebClient fastApiWebClient() {
        return WebClient.builder()
            .baseUrl("<http://10.0.142.249:8000>")
            .clientConnector(new ReactorClientHttpConnector(
                HttpClient.create()
                    .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 5000)
                    .doOnConnected(conn ->
                        conn.addHandlerLast(new ReadTimeoutHandler(10))
                    )
            ))
            .build();
    }
}

```

## 4. 모니터링 및 로깅

### 4.1 성능 모니터링

```java
@Aspect
@Component
public class PerformanceMonitor {

    @Around("@annotation(org.springframework.web.bind.annotation.RequestMapping)")
    public Object logExecutionTime(ProceedingJoinPoint joinPoint) throws Throwable {
        long startTime = System.currentTimeMillis();
        Object result = joinPoint.proceed();
        long endTime = System.currentTimeMillis();

        log.info("API {} executed in {}ms",
                joinPoint.getSignature().getName(),
                endTime - startTime);
        return result;
    }
}

```

### 4.2 헬스 체크 강화

```java
@RestController
public class HealthController {

    @GetMapping("/health/detailed")
    public ResponseEntity<Map<String, Object>> detailedHealth() {
        Map<String, Object> health = new HashMap<>();
        health.put("status", "UP");
        health.put("database", checkDatabaseConnection());
        health.put("redis", checkRedisConnection());
        health.put("fastapi", checkFastApiConnection());
        return ResponseEntity.ok(health);
    }
}

```

## 5. 구현 우선순위

### 5.1 Phase 1 (즉시 적용 가능)

1. **데이터베이스 인덱스 추가**
2. **Redis 캐싱 도입**
3. **연결 풀 최적화**

### 5.2 Phase 2 (1-2주 내)

1. **쿼리 최적화**
2. **비동기 처리 구현**
3. **모니터링 시스템 구축**

### 5.3 Phase 3 (1개월 내)

1. **CDN 도입**
2. **로드 밸런싱**
3. **마이크로서비스 분리 검토**

## 6. 예상 성능 개선 효과

### 6.1 응답 시간 개선

- **메인 페이지**: 800ms → 200ms (75% 개선)
- **상품 상세**: 500ms → 150ms (70% 개선)
- **스토리 목록**: 1000ms → 300ms (70% 개선)

### 6.2 처리량 개선

- **동시 사용자**: 100명 → 1000명 (10배 증가)
- **RPS**: 50 → 500 (10배 증가)

이 명세를 바탕으로 단계별 성능 개선을 진행하시겠습니까?