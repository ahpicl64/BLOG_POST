# TIO 개선 소요 파악 - 성능 최적화 가이드

웹 애플리케이션의 성능 병목을 해결하기 위한 6가지 핵심 최적화 전략을 정리했습니다.

## 1. 데이터베이스 액세스 최적화

### 1.1 N+1 쿼리 문제 해결

**문제:** 연관 엔티티 조회 시 추가 쿼리가 N번 발생

```java
// ❌ 기존: N+1 쿼리 발생 (1 + 100번)
return productRepository.findTop100ByDeletedFalseOrderByWishlistCountDesc()
    .stream()
    .map(product -> new ProductResponseDto(product, 
        product.getCategory().getCategoryName())) // 각 상품마다 카테고리 쿼리 발생
```

```java
// ✅ 개선: Fetch Join 사용
@Query("SELECT p FROM Product p JOIN FETCH p.category c WHERE p.deleted = false " +
       "ORDER BY p.wishlistCount DESC")
List<Product> findTop100WithCategory(Pageable pageable);

// 사용
return productRepository.findTop100WithCategory(PageRequest.of(0, 100))
    .stream()
    .map(product -> new ProductResponseDto(product, liked))
```

**💡 효과:** 101번 쿼리 → 1번 쿼리로 단축

### 1.2 배치 처리 최적화

**문제:** 대량 INSERT 시 개별 쿼리 전송으로 성능 저하

```java
// ❌ 기존: 개별 쿼리 전송
for (OrderItem item : orderItems) {
    orderItemRepository.save(item); // 각각 개별 INSERT
}
```

```java
// ✅ 개선: 배치 처리 설정
# application.properties
spring.jpa.properties.hibernate.jdbc.batch_size=50
spring.jpa.properties.hibernate.order_inserts=true

// 배치 단위로 flush & clear
for (int i = 0; i < orderItems.size(); i += 50) {
    // 50개씩 처리
    entityManager.flush();
    entityManager.clear();
}
```

**💡 효과:** 네트워크 통신 횟수 대폭 감소

## 2. 캐싱 전략 구현

### 2.1 Redis 캐싱 적용

**문제:** 반복 조회되는 데이터를 매번 DB에서 조회

```java
// ❌ 기존: 매번 DB 조회
public ProductDetailResponseDto getProductDetail(Long productId) {
    return productRepository.findById(productId); // 매번 DB 접근
}
```

```java
// ✅ 개선: Redis 캐싱 적용
@Cacheable(value = "productDetail", key = "#productId + '_' + #userId")
public ProductDetailResponseDto getProductDetail(Long userId, Long productId) {
    return productRepository.findById(productId); // Cache Miss 시에만 실행
}

// 캐시 설정
@Bean
public RedisCacheManager cacheManager(RedisConnectionFactory connectionFactory) {
    RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
        .entryTtl(Duration.ofMinutes(10));
    return RedisCacheManager.builder(connectionFactory).cacheDefaults(config).build();
}
```

**💡 효과:** DB 부하 감소, 응답 시간 단축

### 2.2 캐시 무효화 전략

```java
// ✅ 데이터 변경 시 캐시 삭제
@CacheEvict(value = "productDetail", key = "#product.id + '_*'")
public void updateProduct(Product product) {
    productRepository.save(product);
}

// 주기적 캐시 초기화
@Scheduled(fixedRate = 3600000) // 1시간마다
@CacheEvict(value = "productList", allEntries = true)
public void clearProductListCache() {
    log.info("상품 목록 캐시 초기화");
}
```

## 3. 비동기 처리 및 병렬화

### 3.1 비동기 이벤트 처리

**문제:** 부가 작업으로 인한 응답 지연

```java
// ❌ 기존: 동기 처리로 응답 지연
public OrderResponseDto createOrder(OrderRequestDto requestDto) {
    Order order = orderRepository.save(order);
    
    // 주문 완료 후 부가 작업들이 동기적으로 실행
    recommendBehaviorLogService.logUserAction(userId, productId, BUY); // 응답 지연 발생
    
    return new OrderResponseDto(order);
}
```

```java
// ✅ 개선: 비동기 이벤트 처리
@Configuration
@EnableAsync
public class AsyncConfig {
    @Bean
    public Executor taskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(10);
        executor.setMaxPoolSize(50);
        return executor;
    }
}

// 주문 생성 (핵심 로직만)
public OrderResponseDto createOrder(OrderRequestDto requestDto) {
    Order order = orderRepository.save(order);
    orderEventPublisher.publishOrderCreatedEvent(order); // 이벤트 발행만
    return new OrderResponseDto(order); // 즉시 응답
}

// 비동기 처리
@Async("taskExecutor")
@EventListener
public void handleOrderCreatedEvent(OrderCreatedEvent event) {
    recommendBehaviorLogService.logUserAction(userId, productId, BUY); // 별도 스레드에서 처리
}
```

**💡 효과:** 사용자 응답 시간 단축, 시스템 처리량 증가

### 3.2 병렬 데이터 조회

**문제:** 독립적인 데이터를 순차 조회하여 대기 시간 발생

```java
// ❌ 기존: 순차 조회 (총 2.5초)
List<ProductResponseDto> recommendations = 
    productService.getPersonalizedRecommendations(userId); // 1초
List<ProductResponseDto> topRanked = 
    productService.getTopRankedProducts(userId); // 1.5초
```

```java
// ✅ 개선: 병렬 조회 (총 1.5초)
CompletableFuture<List<ProductResponseDto>> recommendationsFuture =
    CompletableFuture.supplyAsync(() -> 
        productService.getPersonalizedRecommendations(userId));

CompletableFuture<List<ProductResponseDto>> topRankedFuture =
    CompletableFuture.supplyAsync(() -> 
        productService.getTopRankedProducts(userId));

// 모든 작업 완료 대기
CompletableFuture.allOf(recommendationsFuture, topRankedFuture).join();

List<ProductResponseDto> recommendations = recommendationsFuture.get();
List<ProductResponseDto> topRanked = topRankedFuture.get();
```

**💡 효과:** 응답 시간 40% 단축

## 4. 응답 데이터 최적화

### 4.1 DTO 경량화 & 프로젝션 쿼리

**문제:** 불필요한 데이터 전송으로 네트워크 부하 증가

```java
// ❌ 기존: 무거운 DTO 사용
public class ProductResponseDto {
    private String description; // 목록에서 불필요한 긴 텍스트
    private List<String> images; // 목록에서 불필요한 모든 이미지
    private CategoryDto category; // 객체 전체 포함
}

// 전체 엔티티 조회 후 변환
@Query("SELECT p FROM Product p WHERE p.deleted = false")
List<Product> findAllProducts();
```

```java
// ✅ 개선: 목록용 경량 DTO
public class ProductSummaryDto {
    private Long id;
    private String name;
    private String thumbnail; // 대표 이미지만
    private String categoryName; // 카테고리 이름만
}

// 프로젝션 쿼리로 필요한 데이터만 조회
@Query("SELECT new com.tryiton.dto.ProductSummaryDto(p.id, p.productName, p.img1, c.categoryName) " +
       "FROM Product p LEFT JOIN p.category c WHERE p.deleted = false")
List<ProductSummaryDto> findProductSummaries();
```

**💡 효과:** 네트워크 트래픽 60% 감소

## 5. JVM 및 서버 최적화

### 5.1 JVM 옵션 최적화

```bash
# ✅ 최적화된 JVM 설정
java -Xms4g -Xmx4g -XX:+UseG1GC -XX:MaxGCPauseMillis=100 -jar app.jar
```

### 5.2 Tomcat 설정 최적화

```properties
# application.properties
server.tomcat.threads.max=400
server.tomcat.accept-count=500
server.tomcat.max-connections=10000
```

### 5.3 데이터베이스 커넥션 풀 최적화

```properties
# HikariCP 설정
spring.datasource.hikari.maximum-pool-size=400
spring.datasource.hikari.minimum-idle=10
spring.datasource.hikari.connection-timeout=30000
```

**💡 효과:** 동시 처리 능력 대폭 향상

## 6. 프론트엔드 최적화

### 6.1 API 요청 최적화

**문제:** 중복 요청으로 서버 부하 증가

```tsx
// ❌ 기존: 중복 요청 방지 없음
const fetchData = () => {
  return axios.get('/api/products'); // 매번 새로운 요청
};
```

```tsx
// ✅ 개선: 요청 캐싱 적용
const requestCache = new Map<string, Promise<any>>();

const axiosWithCache = axios.create();
axiosWithCache.interceptors.request.use((config) => {
  if (config.method === 'get') {
    const cacheKey = `${config.url}:${JSON.stringify(config.params)}`;
    const cachedRequest = requestCache.get(cacheKey);
    
    if (cachedRequest) {
      return { ...config, adapter: () => cachedRequest };
    }
    
    const request = axios(config);
    requestCache.set(cacheKey, request);
    setTimeout(() => requestCache.delete(cacheKey), 5000); // 5초 TTL
  }
  return config;
});
```

### 6.2 데이터 프리페칭

```tsx
// ✅ 사용자 행동 예측하여 미리 데이터 로드
useEffect(() => {
  if (mainProducts?.categories) {
    const firstCategory = mainProducts.categories[0];
    // 첫 번째 카테고리 상품 미리 로드
    queryClient.prefetchQuery({
      queryKey: ['categoryProducts', firstCategory.id],
      queryFn: () => fetchCategoryProducts(firstCategory.id),
    });
  }
}, [mainProducts]);
```

**💡 효과:** 사용자 체감 응답 속도 향상

## 성능 개선 결과 요약

| 최적화 항목 | 개선 전 | 개선 후 | 개선율 |
|------------|---------|---------|--------|
| DB 쿼리 수 | 101회 | 1회 | 99% ↓ |
| 응답 시간 | 2.5초 | 1.5초 | 40% ↓ |
| 네트워크 트래픽 | 100% | 40% | 60% ↓ |
| 동시 처리 능력 | 200 TPS | 400+ TPS | 100% ↑ |

이러한 최적화를 통해 사용자 경험을 크게 개선하고 서버 리소스를 효율적으로 활용할 수 있습니다.
