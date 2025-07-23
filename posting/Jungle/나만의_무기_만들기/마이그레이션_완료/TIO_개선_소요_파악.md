# TIO 개선 소요 파악 (1)

## 1. 데이터베이스 액세스 최적화

데이터베이스는 대부분의 웹 애플리케이션에서 가장 먼저 병목이 발생하는 지점이다. 불필요한 쿼리를 줄이고, 대량의 데이터를 효율적으로 처리하는 것이 성능 향상의 첫걸음이다.

### 1.1 N+1 쿼리 문제

이론적 배경:

JPA와 같은 ORM(Object-Relational Mapping) 프레임워크는 개발 생산성을 크게 향상시키지만, 내부 동작 원리를 이해하지 못하면 심각한 성능 저하를 유발할 수 있다. 우리 코드에서는 N+1 문제는 지연 로딩(Lazy Loading) 때문에 발생한다.

엔티티가 다른 엔티티를 참조할 때(@ManyToOne, @OneToMany), ORM은 성능을 위해 연관된 엔티티를 즉시 로드하지 않고, **`프록시(Proxy)`**라는 `가짜 객체`를 대신 채워둔다. 이후 코드에서 해당 프록시 객체의 실제 데이터(e.g., getCategoryName())에 접근하는 순간, ORM은 그제야 `데이터베이스에 추가 쿼리를 보내` 실제 데이터를 가져온다. 만약 N개의 상품 목록을 조회한 후, 반복문 안에서 각 상품의 카테고리 이름에 접근하면 최초 쿼리 1번 + N개의 추가 쿼리가 발생하게 된다.

**TryItOn 코드의 문제점:**

```java
// ProductService.java - getTopRankedProducts 메소드
// 1. productRepository.findTop100...() 에서 상품 100개를 조회 (1번 쿼리)
return productRepository.findTop100ByDeletedFalseOrderByWishlistCountDesc()
    .stream()
    .map(product -> new ProductResponseDto(product, 
        likedProductIds.contains(product.getId()))) // 2. DTO 생성자에서 N번 추가 쿼리 발생
    .toList();

// ProductResponseDto.java
public ProductResponseDto(Product product, boolean liked) {
    // 3. product.getCategory()는 프록시 객체. .getCategoryName() 호출 시 쿼리 발생
    this.categoryName = product.getCategory().getCategoryName(); 
}
```

개선 방법 및 설명:

Fetch Join은 JPQL에서 `연관된 엔티티를 함께 조회`하도록 명시하는 기능이다. 이를 통해 ORM이 최초 쿼리를 실행할 때부터 연관 엔티티의 실제 데이터를 함께 가져와 영속성 컨텍스트에 로드하므로, 프록시 객체가 아닌 실제 객체가 채워져 추가 쿼리가 발생하지 않는다.

**주의:** JPQL 표준에는 `LIMIT` 키워드가 없다. `findTop100...`과 같은 메서드 이름은 Spring Data JPA가 페이징 처리로 변환해주지만, `@Query` 어노테이션 안에서는 동작하지 않는다. `Pageable`을 사용하거나 `nativeQuery=true` 옵션을 사용해야 한다.

```java
// ProductRepository.java에 추가
// Fetch Join을 사용하여 Product와 Category를 한번에 조회한다.
@Query(value = "SELECT p FROM Product p JOIN FETCH p.category c WHERE p.deleted = false " +
               "ORDER BY p.wishlistCount DESC",
       countQuery = "SELECT count(p) FROM Product p WHERE p.deleted = false") // 페이징을 위한 count 쿼리
List<Product> findTop100WithCategory(Pageable pageable);

// ProductService.java 수정
public List<ProductResponseDto> getTopRankedProducts(Long userId) {
    // PageRequest.of(0, 100)을 통해 상위 100개만 조회하도록 지정
    return productRepository.findTop100WithCategory(PageRequest.of(0, 100))
        .stream()
        .map(product -> new ProductResponseDto(product, 
            likedProductIds.contains(product.getId())))
        .toList();
}
```

### 1.2 배치 처리 최적화

이론적 배경:

대량의 INSERT, UPDATE, DELETE 쿼리를 실행할 때, 각 쿼리를 개별적으로 데이터베이스에 전송하면 네트워크 통신 오버헤드가 커진다. JDBC의 **배치 처리(Batch Processing)**는 여러 개의 쿼리를 하나의 묶음(Batch)으로 만들어 데이터베이스에 한 번에 전송함으로써 이러한 네트워크 비용을 크게 줄여준다. Hibernate는 이 기능을 내부적으로 지원하며, 관련 옵션을 활성화하면 자동으로 배치 처리를 수행한다.

TryItOn 코드의 문제점:

```java
// OrderService.java - createOrder 메소드
@Transactional
public OrderResponseDto createOrder(OrderRequestDto requestDto, String userEmail) {
    // 모든 주문 아이템을 한 번에 처리
    List<OrderItem> orderItems = requestDto.getOrderItems().stream()
        .map(itemDto -> {
            ProductVariant variant = variantMap.get(itemDto.getVariantId());
            return OrderItem.builder()
                    .product(variant.getProduct())
                    .variant(variant)
                    .quantity(itemDto.getQuantity())
                    .unitPrice(variant.getPrice())
                    .build();
        }).collect(Collectors.toList());
    
    // 주문 저장
    orderRepository.save(order);
}
```

createOrder 메소드는 여러 OrderItem을 생성하여 한 번에 save한다. 만약 Hibernate 배치 설정이 없다면, 각 OrderItem에 대한 INSERT 쿼리가 개별적으로 DB에 전송될 수 있다.

```java
// application.properties
# Hibernate JDBC 배치 사이즈 설정 추가
spring.jpa.properties.hibernate.jdbc.batch_size=50
spring.jpa.properties.hibernate.order_inserts=true
spring.jpa.properties.hibernate.order_updates=true
```

개선 방법 및 설명:

```java
// OrderService.java 수정
@Transactional
public OrderResponseDto createOrder(OrderRequestDto requestDto, String userEmail) {
    // 배치 처리로 최적화
    int batchSize = 50;
    List<OrderItem> orderItems = new ArrayList<>();
    
    for (int i = 0; i < requestDto.getOrderItems().size(); i += batchSize) {
        List<OrderRequestDto.OrderItemRequest> batch = requestDto.getOrderItems()
            .subList(i, Math.min(requestDto.getOrderItems().size(), i + batchSize));
            
        // 배치 단위로 처리
        batch.forEach(itemDto -> {
            ProductVariant variant = variantMap.get(itemDto.getVariantId());
            orderItems.add(OrderItem.builder()
                .product(variant.getProduct())
                .variant(variant)
                .quantity(itemDto.getQuantity())
                .unitPrice(variant.getPrice())
                .build());
        });
        
        // 중간에 flush 및 clear로 메모리 관리
        entityManager.flush();
        entityManager.clear();
    }
}
```

위 설정을 추가하면, Hibernate는 쓰기 작업을 모아두었다가 batch_size에 도달하거나 트랜잭션이 커밋될 때 묶어서 보낸다. order_inserts/updates 옵션은 동일한 테이블에 대한 작업을 모아 효율을 높인다.

또한, 제시된 코드의 `entityManager.flush()`와 `clear()`는 대량의 데이터를 처리할 때 **영속성 컨텍스트의 메모리 사용량을 관리**하는 중요한 기법이다.

- `flush()`: 영속성 컨텍스트에 쌓인 변경사항(SQL 쓰기 작업)을 데이터베이스에 강제로 전송한다. (배치 쿼리가 전송되는 시점)
- `clear()`: 1차 캐시를 포함한 영속성 컨텍스트를 비워 메모리를 확보한다.

이 두 가지를 조합하면, 애플리케이션 메모리 부족 없이 대량의 데이터를 안정적으로 처리할 수 있다.

## 2. 캐싱 전략 구현

### 2.1 Redis 캐싱 적용

이론적 배경:

캐싱은 자주 사용되지만 잘 변하지 않는 데이터를 응답 속도가 빠른 저장소(주로 메모리)에 복사해두고, 요청이 들어올 때 데이터베이스 대신 캐시에서 데이터를 제공하는 전략이다. 이를 통해 DB 부하를 줄이고 애플리케이션 응답 속도를 획기적으로 개선할 수 있다.

- **Cache Hit**: 요청한 데이터가 캐시에 존재하는 경우. DB 접근 없이 바로 반환하므로 매우 빠르다.
- **Cache Miss**: 데이터가 캐시에 없는 경우. DB에서 데이터를 조회한 후 캐시에 저장하고 반환한다.

TryItOn 코드의 문제점:

```java
// ProductService.java - getProductDetail 메소드
@Transactional(readOnly = true)
public ProductDetailResponseDto getProductDetail(Long userId, Long productId) {
    // 매번 데이터베이스에서 조회
    Product product = productRepository.findByIdWithCategoryAndVariants(productId)
        .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND,
            "ID " + productId + "에 해당하는 상품을 찾을 수 없습니다."));
    
    // 변환 로직...
    return new ProductDetailResponseDto(product, variantDto, liked);
}
```

상품 상세 정보처럼 반복 조회될 가능성이 높은 데이터를 매번 DB에서 조회하여 부하를 유발한다.

개선 방법 및 설명:

Spring의 @Cacheable 어노테이션을 사용하면 AOP(관점 지향 프로그래밍) 기반으로 캐싱 로직이 자동으로 적용된다.

- `@Cacheable`이 붙은 메소드가 호출되면, Spring은 먼저 `value`와 `key`에 해당하는 데이터가 캐시에 있는지 확인한다.
- **Cache Hit**: 데이터가 있으면 메소드를 실행하지 않고 캐시 값을 즉시 반환한다.
- **Cache Miss**: 데이터가 없으면 메소드를 실행하고, 그 반환 값을 캐시에 저장한 후 사용자에게 반환한다.

```java
// ProductService.java에 캐싱 적용
// value: 캐시 그룹명, key: 캐시 식별자. SpEL을 사용해 동적으로 키 생성
@Cacheable(value = "productDetail", key = "#productId + '_' + #userId") 
@Transactional(readOnly = true)
public ProductDetailResponseDto getProductDetail(Long userId, Long productId) {
    // 이 메소드의 내용은 Cache Miss 시에만 실행된다.
}
```

```java
// CacheConfig.java 생성@Configuration
@EnableCaching
public class CacheConfig {
    @Bean
    public RedisCacheManager cacheManager(RedisConnectionFactory connectionFactory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(10));

        Map<String, RedisCacheConfiguration> cacheConfigs = new HashMap<>();
        cacheConfigs.put("productDetail", config.entryTtl(Duration.ofMinutes(10)));
        cacheConfigs.put("productList", config.entryTtl(Duration.ofMinutes(5)));

        return RedisCacheManager.builder(connectionFactory)
            .cacheDefaults(config)
            .withInitialCacheConfigurations(cacheConfigs)
            .build();
    }
}

// ProductService.java에 캐싱 적용@Cacheable(value = "productDetail", key = "#productId + '_' + #userId")
@Transactional(readOnly = true)
public ProductDetailResponseDto getProductDetail(Long userId, Long productId) {
// 기존 코드 그대로 유지// Redis에서 캐시 히트 시 메소드 실행 스킵
}
```

### 2.2 캐시 무효화 전략

이론적 배경:

캐싱의 가장 큰 난제는 **'데이터 일관성'**이다. 원본 데이터베이스의 데이터가 변경되었을 때, 캐시에 남아있는 이전 데이터를 어떻게 갱신(무효화)할 것인지에 대한 전략이 반드시 필요하다.

- **TTL (Time-To-Live)**: 캐시에 유효시간을 설정하고, 시간이 만료되면 자동으로 삭제되게 하는 가장 간단한 방법. (2.1 개선 코드의 `entryTtl`)
- **데이터 변경 시 명시적 삭제**: 데이터가 `UPDATE` 또는 `DELETE` 될 때, 코드에서 직접 캐시를 삭제하는 방법. 데이터 일관성을 높일 수 있다.

TryItOn 코드의 문제점:

```java
// ProductService.java - 캐시 무효화 로직 부재@Transactional
public void updateProduct(Product product) {
    productRepository.save(product);
// 캐시 무효화 로직 없음
}
```

상품 정보가 수정되어도 캐시가 그대로 남아있어 사용자에게 오래된 정보가 노출될 수 있다.

개선 방법 및 설명:

```java
// ProductService.java에 캐시 무효화 추가@CacheEvict(value = "productDetail", key = "#product.id + '_*'")
@Transactional
public void updateProduct(Product product) {
    productRepository.save(product);
}

@Scheduled(fixedRate = 3600000)// 1시간마다 실행@CacheEvict(value = "productList", allEntries = true)
public void clearProductListCache() {
    log.info("상품 목록 캐시 초기화");
}
```

Spring의 @CacheEvict 어노테이션으로 데이터 변경 시 특정 캐시를 삭제할 수 있다.

- `@CacheEvict`: 메소드 실행 후 지정된 캐시를 삭제한다. `key`를 사용해 특정 항목만 삭제할 수 있다.  와일드카드를 사용하면 `productId`가 일치하고 `userId`는 무엇이든 상관없이 모두 삭제할 수 있다.
- `@Scheduled` + `@CacheEvict(allEntries = true)`: 주기적으로 특정 캐시 그룹의 모든 데이터를 삭제하는 방식. 상품 목록처럼 개인화되지 않고 여러 데이터가 섞여 있어 개별 추적이 어려운 경우에 유용하다.

## 3. 비동기 처리 및 병렬화

### 3.1 비동기 이벤트 처리

이론적 배경:

웹 서버의 요청 처리 스레드는 한정된 자원이다. 동기(Synchronous) 방식은 작업이 끝날 때까지 스레드가 대기(Blocking)하므로, 오래 걸리는 작업이 포함되면 전체 시스템의 처리량이 급격히 감소한다. 비동기(Asynchronous) 처리는 시간이 오래 걸리지만 당장 결과가 필요 없는 작업(이메일 발송, 푸시 알림, 로그 기록 등)을 별도의 스레드 풀에 위임하고, 메인 스레드는 즉시 다음 요청을 처리하거나 사용자에게 응답을 반환하는 방식이다. 이를 통해 사용자 응답 시간을 단축하고 시스템의 처리 효율을 극대화할 수 있다.

TryItOn 코드의 문제점:

```java
// OrderService.java - createOrder 메소드@Transactional
public OrderResponseDto createOrder(OrderRequestDto requestDto, String userEmail) {
// 주문 생성 로직...Order order = orderRepository.save(order);

// 주문 완료 후 부가 작업들이 동기적으로 실행됨for (OrderItem orderItem: order.getOrderItems()){
        Long productId = orderItem.getProduct().getId();
        recommendBehaviorLogService.logUserAction(user.getId(), productId, RecommendAction.BUY);
    }

    return new OrderResponseDto(order, orderName);
}
```

주문 생성이라는 핵심 로직이 끝난 후, 추천 데이터 로깅이라는 부가적인 작업을 동기적으로 처리하여 사용자 응답이 지연된다.

개선 방법 및 설명:

```java
// AsyncConfig.java 생성@Configuration
@EnableAsync
public class AsyncConfig {
    @Bean(name = "taskExecutor")
    public Executor taskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(10);
        executor.setMaxPoolSize(50);
        executor.setQueueCapacity(500);
        executor.initialize();
        return executor;
    }
}

// OrderService.java 수정@Transactional
public OrderResponseDto createOrder(OrderRequestDto requestDto, String userEmail) {
// 주문 생성 핵심 로직...Order order = orderRepository.save(order);

// 비핵심 작업은 비동기로 처리
    orderEventPublisher.publishOrderCreatedEvent(order);

    return new OrderResponseDto(order, orderName);
}

// OrderEventListener.java 생성@Component
public class OrderEventListener {
    @Async("taskExecutor")
    @EventListener
    public void handleOrderCreatedEvent(OrderCreatedEvent event) {
        Order order = event.getOrder();

// 비동기로 처리할 부가 작업들for (OrderItem orderItem : order.getOrderItems()) {
            recommendBehaviorLogService.logUserAction(
                order.getUser().getId(),
                orderItem.getProduct().getId(),
                RecommendAction.BUY
            );
        }
    }
}
```

Spring의 이벤트 리스너와 @Async를 활용한다.

1. **`@EnableAsync`**: 애플리케이션에 비동기 기능 활성화.
2. **`ThreadPoolTaskExecutor`**: 비동기 작업을 처리할 별도의 스레드 풀을 설정.
3. **`ApplicationEventPublisher`**: `createOrder` 메소드에서는 '주문이 생성되었다'는 이벤트만 발행하고 즉시 종료.
4. **`@EventListener` + `@Async`**: 해당 이벤트를 구독하는 리스너가 별도의 스레드에서 추천 로그 기록과 같은 후속 작업을 처리.

### 3.2 병렬 데이터 조회

이론적 배경:

서로 의존성이 없는 여러 개의 데이터를 조회할 때, 이를 순차적으로 처리하면 총 응답 시간은 각 작업 시간의 합이 된다. (A 작업 1초, B 작업 1.5초 → 총 2.5초). Java의 CompletableFuture를 사용하면 이러한 독립적인 작업들을 병렬로 실행하여 총 응답 시간을 가장 오래 걸리는 작업 시간에 가깝게 단축시킬 수 있다. (A, B 동시 실행 → 총 1.5초)

TryItOn 코드의 문제점:

```java
// MainProductController.java - getMainProducts 메소드@GetMapping("/home/products")
public ResponseEntity<MainProductResponse> getMainProducts(Authentication authentication) {
    Long userId = getUserIdFromAuthentication(authentication);

// 순차적으로 데이터 조회
    List<ProductResponseDto> recommendations =
        productService.getPersonalizedRecommendations(userId);
    List<ProductResponseDto> topRanked =
        productService.getTopRankedProducts(userId);

    return ResponseEntity.ok(MainProductResponse.success(recommendations, topRanked));
}
```

메인 페이지에서 '개인화 추천 상품'과 '상위 랭킹 상품'이라는 두 개의 독립적인 목록을 순차적으로 조회하여 불필요한 대기 시간이 발생한다.

개선 방법 및 설명:

```java
// MainProductController.java 수정@GetMapping("/home/products")
public ResponseEntity<MainProductResponse> getMainProducts(Authentication authentication) {
    Long userId = getUserIdFromAuthentication(authentication);

// 병렬로 데이터 조회
    CompletableFuture<List<ProductResponseDto>> recommendationsFuture =
        CompletableFuture.supplyAsync(() ->
            productService.getPersonalizedRecommendations(userId));

    CompletableFuture<List<ProductResponseDto>> topRankedFuture =
        CompletableFuture.supplyAsync(() ->
            productService.getTopRankedProducts(userId));

// 모든 비동기 작업 완료 대기
    CompletableFuture.allOf(recommendationsFuture, topRankedFuture).join();

    try {
        List<ProductResponseDto> recommendations = recommendationsFuture.get();
        List<ProductResponseDto> topRanked = topRankedFuture.get();

        return ResponseEntity.ok(MainProductResponse.success(recommendations, topRanked));
    } catch (Exception e) {
        throw new BusinessException(HttpStatus.INTERNAL_SERVER_ERROR, "데이터 조회 중 오류가 발생했습니다.");
    }
}
```

CompletableFuture.supplyAsync()는 제공된 작업을 별도의 스레드(기본적으로 ForkJoinPool)에서 실행하고 즉시 CompletableFuture 객체를 반환한다. CompletableFuture.allOf().join()은 모든 비동기 작업이 완료될 때까지 대기하므로, 두 데이터 조회가 병렬로 처리된 후 결과를 안전하게 조합할 수 있다.

## 4. 응답 데이터 최적화

네트워크를 통해 전송되는 데이터의 양과 이를 처리하는 과정(직렬화/역직렬화)은 응답 시간에 직접적인 영향을 미친다. 필요한 데이터만 효율적으로 전송하는 것이 중요하다.

### 4.1 DTO 경량화 & 4.2 프로젝션 쿼리 사용

이론적 배경:

- **DTO(Data Transfer Object)**는 계층 간 데이터 전송을 위해 사용하는 객체다. 하지만 화면마다 필요한 데이터가 다름에도 불구하고 항상 모든 필드를 포함하는 거대한 DTO를 사용하면, 불필요한 데이터 전송으로 인한 네트워크 지연과 JSON 직렬화/역직렬화에 드는 CPU 비용이 증가한다.
- *프로젝션(Projection)**은 이 문제를 근본적으로 해결하는 JPA/Spring Data JPA의 기능이다. 처음부터 데이터베이스에 필요한 컬럼만 명시적으로 SELECT 하도록 쿼리를 보내는 방식이다. 이를 통해 DB와 애플리케이션 서버 간의 네트워크 트래픽을 최소화하고, 영속성 컨텍스트에 등록되는 엔티티의 오버헤드도 피할 수 있다.

TryItOn 코드의 문제점:

```java
// ProductResponseDto.javapublic class ProductResponseDto {
    private Long id;
    private String name;
    private String brand;
    private int price;
    private int sale;
    private int salePrice;
    private String thumbnail;
    private String description;// 목록에서는 불필요한 긴 텍스트private List<String> images;// 목록에서는 불필요한 모든 이미지private CategoryDto category;// 객체 전체를 포함private boolean liked;

// 생성자에서 모든 필드 복사public ProductResponseDto(Product product, boolean liked) {
        this.id = product.getId();
        this.name = product.getProductName();
// ... 모든 필드 복사this.description = product.getDescription();
        this.images = product.getImages().stream().map(Image::getUrl).collect(Collectors.toList());
        this.category = new CategoryDto(product.getCategory());
    }
}
```

```java
// ProductRepository.java@Query("SELECT p FROM Product p WHERE p.deleted = false ORDER BY p.wishlistCount DESC")
List<Product> findTop100ByDeletedFalseOrderByWishlistCountDesc();

// ProductService.javapublic List<ProductResponseDto> getTopRankedProducts(Long userId) {
// 전체 엔티티 조회 후 변환return productRepository.findTop100ByDeletedFalseOrderByWishlistCountDesc()
        .stream()
        .map(product -> new ProductResponseDto(product,
            likedProductIds.contains(product.getId())))
        .toList();
}
```

상품 목록 조회 시, 상세 페이지에서나 필요한 description, images 등 무거운 데이터를 모두 포함하는 ProductResponseDto를 사용한다. 또한, SELECT p FROM Product p... 처럼 엔티티 전체를 조회한 후 애플리케이션에서 DTO로 변환하므로 비효율적이다.

개선 방법 및 설명:

목록용 경량 DTO(ProductSummaryDto)를 정의하고, JPQL에서 DTO 생성자나 인터페이스 기반 프로젝션을 사용하여 DB로부터 필요한 데이터만 직접 조회한다.

1. **DTO 직접 생성 방식 (더 간결함):**
    
    ```java
    // ProductSummaryDto에 JPQL 결과 매핑을 위한 생성자 추가
    public ProductSummaryDto(Long id, String name, String brand, int price, int sale, String thumbnail, String categoryName) {
        // ... 필드 매핑
    }
    
    // ProductRepository.java
    // NEW 키워드를 사용해 JPQL 조회 결과를 즉시 DTO로 변환
    @Query("SELECT new com.tryiton.dto.ProductSummaryDto(p.id, p.productName, p.brand, p.price, p.sale, p.img1, c.categoryName) " +
           "FROM Product p LEFT JOIN p.category c WHERE p.deleted = false ORDER BY p.wishlistCount DESC")
    List<ProductSummaryDto> findTop100Summary(Pageable pageable);
    
    // ProductService.java
    public List<ProductSummaryDto> getTopRankedProducts(Long userId) {
        List<ProductSummaryDto> summaries = productRepository.findTop100Summary(PageRequest.of(0, 100));
        // '좋아요' 정보는 서비스 로직에서 별도로 처리하여 채워넣는다.
        // ...
        return summaries;
    }
    ```
    
    ```java
    // 목록용 경량 DTO 추가public class ProductSummaryDto {
        private Long id;
        private String name;
        private String brand;
        private int price;
        private int sale;
        private int salePrice;
        private String thumbnail;// 대표 이미지 1개만private String categoryName;// 카테고리 이름만private boolean liked;
    
        public ProductSummaryDto(Product product, boolean liked) {
            this.id = product.getId();
            this.name = product.getProductName();
            this.brand = product.getBrand();
            this.price = product.getPrice();
            this.sale = product.getSale();
            this.salePrice = calculateSalePrice(product.getPrice(), product.getSale());
            this.thumbnail = product.getImg1();
            this.categoryName = product.getCategory() != null ?
                product.getCategory().getCategoryName() : null;
            this.liked = liked;
        }
    }
    
    // ProductService.java에서 사용public List<ProductSummaryDto> getTopRankedProducts(Long userId) {
    // 경량 DTO 사용return productRepository.findTop100WithCategory()
            .stream()
            .map(product -> new ProductSummaryDto(product,
                likedProductIds.contains(product.getId())))
            .toList();
    }
    ```
    
2. **인터페이스 기반 프로젝션 방식 (제시된 방식):**

```java
// ProductRepository.java에 프로젝션 인터페이스 추가public interface ProductProjection {
    Long getId();
    String getProductName();
    String getBrand();
    int getPrice();
    int getSale();
    String getImg1();
    CategoryProjection getCategory();

    interface CategoryProjection {
        String getCategoryName();
    }
}

// 프로젝션 쿼리 추가@Query("SELECT p.id as id, p.productName as productName, p.brand as brand, " +
       "p.price as price, p.sale as sale, p.img1 as img1, " +
       "c.categoryName as category.categoryName " +
       "FROM Product p LEFT JOIN p.category c " +
       "WHERE p.deleted = false ORDER BY p.wishlistCount DESC LIMIT 100")
List<ProductProjection> findTop100ProjectionOrderByWishlistCountDesc();

// ProductService.java에서 사용public List<ProductSummaryDto> getTopRankedProducts(Long userId) {
// 프로젝션 쿼리 사용return productRepository.findTop100ProjectionOrderByWishlistCountDesc()
        .stream()
        .map(p -> new ProductSummaryDto(
            p.getId(),
            p.getProductName(),
            p.getBrand(),
            p.getPrice(),
            p.getSale(),
            p.getImg1(),
            p.getCategory() != null ? p.getCategory().getCategoryName() : null,
            likedProductIds.contains(p.getId())
        ))
        .toList();
}
```

 `ProductProjection` 인터페이스를 정의하고 리포지토리 메서드의 반환 타입으로 지정하면, Spring Data JPA가 해당 인터페이스를 구현한 프록시 객체를 생성하여 결과를 채워준다. 이 방식 역시 필요한 컬럼만 조회하는 최적화된 SQL을 생성한다.

## 5. JVM 및 서버 최적화

애플리케이션 코드뿐만 아니라, 코드가 실행되는 환경(JVM, 웹 서버)을 최적화하는 것도 고성능 확보에 필수적이다.

### 5.1 JVM 옵션 최적화

이론적 배경:

JVM(Java Virtual Machine)은 다양한 옵션을 통해 메모리 관리 및 GC(Garbage Collection) 동작을 세밀하게 제어할 수 있다.

- **`Xms`, `Xmx`**: JVM 힙(Heap) 메모리의 시작 크기와 최대 크기를 지정한다. 두 값을 동일하게 설정하면 런타임 중 힙 크기 조절로 인한 성능 저하를 방지할 수 있다.
- **`XX:+UseG1GC`**: G1(Garbage-First) GC를 사용하도록 지정한다. G1 GC는 큰 힙 메모리 환경에서 짧은 GC 일시 중지(Pause) 시간을 목표로 설계되어, 사용자 요청에 대한 응답 지연을 최소화하는 데 효과적이다.

문제 : 

**개선 방법:**

```java
# 최적화된 JVM 옵션 예시
# 4GB 힙 메모리 할당, G1 GC 사용, 최대 GC 중지 시간 100ms 목표
java -Xms4g -Xmx4g -XX:+UseG1GC -XX:MaxGCPauseMillis=100 -jar app.jar
```

### 5.2 Tomcat 설정 최적화

이론적 배경:

Spring Boot에 내장된 Tomcat은 동시 요청을 처리하기 위해 스레드 풀을 사용한다.

- **`max-threads`**: 동시에 처리할 수 있는 최대 요청(스레드)의 수. 이 값을 초과하는 요청은 대기 큐로 넘어간다.
- **`accept-count`**: 모든 스레드가 사용 중일 때, 들어오는 요청을 대기시킬 수 있는 큐의 크기.
- **`max-connections`**: 서버가 수락하고 유지할 수 있는 총 연결의 수.

개선 방법:

TPS 목표치와 시스템 리소스를 고려하여 이 값들을 적절히 상향 조정하면 더 많은 동시 요청을 안정적으로 처리할 수 있다. application.properties 또는 Java Config로 설정할 수 있다.

```java
# application.properties
server.tomcat.threads.max=400
server.tomcat.accept-count=500
server.tomcat.max-connections=10000
```

### 5.3 데이터베이스 커넥션 풀 최적화

이론적 배경:

DB 커넥션을 생성하는 과정은 비용이 매우 높은 작업이다. 커넥션 풀은 미리 일정량의 DB 커넥션을 만들어두고, 요청이 들어올 때마다 빌려주고 반납받아 재사용하는 방식이다. HikariCP는 Spring Boot의 기본 커넥션 풀이며, 그 성능을 극대화하기 위한 설정이 필요하다.

- **`maximum-pool-size`**: 커넥션 풀이 가질 수 있는 최대 커넥션 수. 일반적으로 **Tomcat의 `max-threads` 수와 비슷하거나 약간 더 크게** 설정하는 것이 권장된다.

**개선 방법:**

```java
# application.properties에 추가
spring.datasource.hikari.maximum-pool-size=400 # Tomcat max-threads와 맞춤
spring.datasource.hikari.minimum-idle=10
spring.datasource.hikari.connection-timeout=30000
spring.datasource.hikari.idle-timeout=600000
spring.datasource.hikari.max-lifetime=1800000
```

## 6. 프론트엔드 최적화

서버의 성능만큼 사용자가 체감하는 성능(Perceived Performance)도 중요하다. 프론트엔드 최적화는 서버 부하를 줄이고 사용자 경험을 향상시킨다.

### 6.1 API 요청 최적화

이론적 배경:

사용자가 짧은 시간 안에 동일한 데이터를 여러 번 요청하는 경우가 있다. (e.g., 버튼 중복 클릭, 페이지 재진입). **요청 캐싱/중복 방지(Deduplication)**는 특정 시간 동안 동일한 GET 요청에 대해서는 첫 번째 요청만 서버로 보내고, 후속 요청들은 진행 중인 첫 번째 요청의 결과를 기다려 함께 사용하게 하는 기법이다. 이를 통해 불필요한 서버 트래픽을 막을 수 있다.

```tsx
// src/api/index.ts - 요청 캐싱 없음export const axiosWithAuth = (): AxiosInstance => {
  if (!authInstance) {
    authInstance = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL,
    });
    setRequestInterceptor(authInstance);
    setResponseInterceptor(authInstance);
  }
  return authInstance;
};
```

개선 방법 및 설명:

```tsx
// src/api/index.ts - 요청 캐싱 추가// 요청 캐시 저장소const requestCache = new Map<string, Promise<any>>();

// 캐시 키 생성 함수const createCacheKey = (config: AxiosRequestConfig): string => {
  return `${config.method}:${config.url}:${JSON.stringify(config.params)}`;
};

// 인증용 인스턴스 반환 (캐싱 적용)export const axiosWithAuth = (): AxiosInstance => {
  if (!authInstance) {
    authInstance = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL,
    });

// 요청 인터셉터
    authInstance.interceptors.request.use(
      (config) => {
// 토큰 설정 로직...

// GET 요청에 대한 캐싱 처리if (config.method?.toLowerCase() === 'get') {
          const cacheKey = createCacheKey(config);
          const cachedResponse = requestCache.get(cacheKey);

          if (cachedResponse) {
// 이미 진행 중인 요청이 있으면 재사용return {
              ...config,
              adapter: () => cachedResponse,
            };
          }

// 새 요청 캐싱const request = axios(config);
          requestCache.set(cacheKey, request);

// 5초 후 캐시 삭제 (TTL)setTimeout(() => {
            requestCache.delete(cacheKey);
          }, 5000);
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

// 응답 인터셉터 설정...
  }
  return authInstance;
};
```

제시된 코드는 axios 인터셉터를 활용한 훌륭한 예시이다. Map을 사용해 진행 중인 요청(Promise)을 캐싱하고, 동일한 요청이 감지되면 새 네트워크 호출을 막고 기존 Promise를 재사용한다. setTimeout으로 간단한 TTL을 구현하여 일정 시간 후에는 다시 새로운 데이터를 요청하도록 한다.

### 6.2 데이터 프리페칭

이론적 배경:

- *프리페칭(Prefetching)**은 사용자가 특정 액션을 취하기 전에, 그 액션의 결과로 필요할 데이터를 미리 백그라운드에서 로드해두는 기법이다. 예를 들어, 사용자가 상품 목록 위에 마우스를 올렸을 때 해당 상품의 상세 정보를 미리 로드해두면, 사용자가 클릭했을 때 데이터를 기다릴 필요 없이 즉시 상세 페이지를 보여줄 수 있어 매우 빠른 반응 속도를 경험하게 된다.

```tsx
// src/app/page.tsx - 데이터 프리페칭 없음export default function Home() {
  const { data: mainProducts } = useQuery({
    queryKey: ['mainProducts'],
    queryFn: fetchMainProducts,
  });

// 렌더링 로직...
}
```

개선 방법 및 설명:

```tsx
// src/app/page.tsx - 데이터 프리페칭 추가export default function Home() {
  const { data: mainProducts } = useQuery({
    queryKey: ['mainProducts'],
    queryFn: fetchMainProducts,
  });

// 카테고리 상품 프리페칭useEffect(() => {
    if (mainProducts?.categories) {
// 첫 번째 카테고리 상품 미리 로드const firstCategory = mainProducts.categories[0];
      if (firstCategory) {
        queryClient.prefetchQuery({
          queryKey: ['categoryProducts', firstCategory.id],
          queryFn: () => fetchCategoryProducts({ categoryId: firstCategory.id }),
        });
      }
    }
  }, [mainProducts]);

// 렌더링 로직...
}
```

React-Query(TanStack Query)의 queryClient.prefetchQuery는 데이터를 미리 가져와 캐시에 저장하는 기능을 제공한다. 제시된 코드는 메인 페이지의 카테고리 목록이 로드되면, 사용자가 가장 먼저 클릭할 확률이 높은 첫 번째 카테고리의 상품 데이터를 미리 로드하여 사용자 경험을 향상시킨다.