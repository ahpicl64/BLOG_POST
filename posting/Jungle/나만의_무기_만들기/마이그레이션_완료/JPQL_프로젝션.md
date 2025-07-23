# JPQL 프로젝션 (1)

> 카테고리별 상품 조회 API의 성능 개선을 위해, 불필요한 데이터를 조회하던 기존 방식에서 JPQL 프로젝션을 도입하여 필요한 데이터만 DTO로 직접 조회하도록 변경함. 

이를 통해 DB와 서버 간의 네트워크 I/O를 줄이고, JPA의 내부 관리 오버헤드를 제거하여 API 응답 속도와 처리량을 향상시킴.
> 

---

## 문제 정의: 왜 최적화가 필요했는가?

기존 카테고리별 상품 목록 조회 API는 다음과 같은 데이터 흐름을 가지고 있었음.

[Repository] → [Service] → [Controller] → [HTTP Response]

이 과정에서 두 가지 비효율이 발생함.

### 불필요한 데이터 조회 (Over-fetching)

- Repository 계층(ProductRepository)은 SELECT p FROM Product p 쿼리를 통해 Product 엔티티와 매핑된 DB 테이블의 모든 컬럼을 조회함.
- 실제 API 응답에는 id, name, price 등 일부 컬럼만 필요하지만, updateAt, deleted 등 목록 표시에 사용되지 않는 데이터까지 모두 조회하여 DB와 애플리케이션 서버 간에 불필요한 네트워크 트래픽을 유발함.

### JPA 엔티티 관리 오버헤드

- Service 계층(ProductService)은 Repository로부터 Product 엔티티 객체를 전달받은 후, 이를 ProductResponseDto로 변환하는 작업을 수행함.
- 이 과정에서 JPA는 영속성 컨텍스트 내에서 해당 엔티티들의 변경 상태를 추적(Dirty Checking)해야 하므로, 추가적인 메모리와 CPU 자원을 소모하는 오버헤드가 발생함.

이러한 비효율은 캐시가 없는 최초 요청이나 캐시 만료 후 요청 시에 반드시 발생하며, 트래픽이 증가할수록 시스템 전체 성능에 부담을 주는 요인이됨.

---

## 해결 방안: JPQL 프로젝션이란?

이 문제를 해결하기 위해 JPQL 프로젝션(Projection)을 도입함.

### JPQL (Java Persistence Query Language) 이란?

- 테이블이 아닌 엔티티 객체를 대상으로 하는 객체지향 쿼리 언어. SQL과 유사하지만, DB 테이블이나 컬럼 이름 대신 엔티티와 필드 이름을 사용함.

### 프로젝션 (Projection) 이란?

- 조회 대상(엔티티)에서 필요한 특정 필드들만 선택하여 조회하는 기법을 의미함.
- JPQL에서는 SELECT new com.your.package.Dto(...) 구문을 사용하여, 쿼리 결과로부터 엔티티 객체를 거치지 않고 즉시 DTO(Data Transfer Object)를 생성할 수 있음.

이 방식을 적용하면 다음과 같이 데이터 흐름이 개선됨.

1. Repository: SELECT new ...Dto(...) 쿼리를 통해 DB에서 필요한 컬럼만 읽어와서 처음부터 DTO 객체를 생성함.
2. Service: Repository로부터 DTO를 직접 받음. JPA는 이 DTO를 관리하지 않으므로 엔티티 관리 오버헤드가 발생하지 않음.

---

## 변경 내역: Before & After

### 가. ProductSummaryDto.java 파일 생성

상품 목록 표시에 필요한 최소한의 필드만 포함하는 새로운 경량 DTO를 생성함.

```java

    1 // src/main/java/com/tryiton/core/product/dto/ProductSummaryDto.java
    2 package com.tryiton.core.product.dto;
    3 
    4 import java.time.LocalDateTime;
    5 import lombok.Getter;
    6 import lombok.Setter;
    7 
    8 @Getter
    9 public class ProductSummaryDto {
   10 
   11     private Long id;
   12     private String productName;
   13     private String img1;
   14     private int price;
   15     private int sale;
   16     private int salePrice;
   17     private String brand;
   18     private int wishlistCount;
   19     private LocalDateTime createdAt;
   20 
   21     @Setter
   22     private boolean liked;
   23 
   24     // JPQL 프로젝션을 위한 생성자
   25     public ProductSummaryDto(Long id, String productName, String img1, int price, int sale, String brand, int wishlistCount,
      LocalDateTime createdAt) {
   26         this.id = id;
   27         this.productName = productName;
   28         this.img1 = img1;
   29         this.price = price;
   30         this.sale = sale;
   31         this.brand = brand;
   32         this.wishlistCount = wishlistCount;
   33         this.createdAt = createdAt;
   34 
   35         if (sale > 0) {
   36             this.salePrice = (int) Math.round(price * (100.0 - sale) / 100.0);
   37         } else {
   38             this.salePrice = price;
   39         }
   40     }
   41 }

```

### 나. ProductRepository.java 수정

기존 엔티티 조회 메소드는 유지하고, JPQL 프로젝션을 사용하는 새로운 메소드findSummaryByCategoryHierarchy를 추가함.

```java

    1 // src/main/java/com/tryiton/core/product/repository/ProductRepository.java
    2 
    3      // 🔧 상위 카테고리와 모든 하위 카테고리의 상품을 함께 조회
    4      @Query("SELECT p FROM Product p WHERE p.deleted = false AND " +
    5          "(p.category.id = :categoryId OR p.category.parentCategory.id = :categoryId) " +
    6          "ORDER BY p.createAt DESC")
    7      Page<Product> findByCategoryHierarchyAndDeletedFalse(@Param("categoryId") Long categoryId, Pageable pageable);
    8 
    9 +    // JPQL 프로젝션을 사용하여 ProductSummaryDto를 직접 조회
   10 +    @Query("SELECT new com.tryiton.core.product.dto.ProductSummaryDto(p.id, p.productName, p.img1, p.price, p.sale, p.brand, 
      p.wishlistCount, p.createAt) " +
   11 +            "FROM Product p WHERE p.deleted = false AND " +
   12 +            "(p.category.id = :categoryId OR p.category.parentCategory.id = :categoryId)")
   13 +    Page<ProductSummaryDto> findSummaryByCategoryHierarchy(@Param("categoryId") Long categoryId, Pageable pageable);
   14 +    
   15      // 시드 기반 랜덤 정렬로 페이지네이션 지원
   16      @Query(value = "SELECT * FROM product WHERE deleted = false AND category_id IN " +
   17          "(SELECT category_id FROM category WHERE category_id = :categoryId OR parent_category_id = :categoryId) " +

```

### 다. ProductService.java 수정

getProductsByCategory 메소드가 새로운 DTO와 Repository 메소드를 사용하도록 수정함.

```java

    1 // src/main/java/com/tryiton/core/product/service/ProductService.java
    2 
    3 -    @Cacheable(value = "categoryProducts", key = "'category:' + #category.id + ':page:' + #page + ':size:' + #size")
    4 -    public Page<ProductResponseDto> getProductsByCategory(Long userId, Category category, int page, int size) {
    5 -        Pageable pageable = PageRequest.of(page, size, 
    6 -            Sort.by("wishlistCount").descending().and(Sort.by("createAt").descending()));
    7 -
    8 -        Page<Product> products = productRepository.findByCategoryHierarchyAndDeletedFalse(
    9 -            category.getId(), pageable);
   10 -
   11 -        if (products == null) {
   12 -            return Page.empty();
   13 -        }
   14 -
   15 -        if (userId != null) {
   16 -            Set<Long> likedProductIds = new HashSet<>(
   17 -                wishlistRepository.findProductIdsByUserId(userId));
   18 -            return products.map(product -> 
   19 -                new ProductResponseDto(product, likedProductIds.contains(product.getId())));
   20 -        }
   21 -
   22 -        return products.map(product -> new ProductResponseDto(product, false));
   23 -    }
   24 +    @Cacheable(value = "categoryProducts", key = "'category:' + #category.id + ':page:' + #page + ':size:' + #size")
   25 +    public Page<ProductSummaryDto> getProductsByCategory(Long userId, Category category, int page, int size) {
   26 +        Pageable pageable = PageRequest.of(page, size, 
   27 +            Sort.by("wishlistCount").descending().and(Sort.by("createAt").descending()));
   28 +
   29 +        Page<ProductSummaryDto> products = productRepository.findSummaryByCategoryHierarchy(
   30 +            category.getId(), pageable);
   31 +
   32 +        if (products == null || !products.hasContent()) {
   33 +            return Page.empty();
   34 +        }
   35 +
   36 +        if (userId != null) {
   37 +            Set<Long> likedProductIds = new HashSet<>(
   38 +                wishlistRepository.findProductIdsByUserId(userId));
   39 +            products.forEach(dto -> dto.setLiked(likedProductIds.contains(dto.getId())));
   40 +        }
   41 +
   42 +        return products;
   43 +    }

```

### 라. ProductController.java 수정 및 기존 DTO 백업

서비스의 반환 타입 변경에 따라 Controller도 수정하고, 더 이상 사용되지 않는 CategoryProductResponse는 .bak 확장자로 백업 처리함.

```java

    1 // src/main/java/com/tryiton/core/product/controller/ProductController.java
    2 
    3 -    @GetMapping("/category")
    4 -    public ResponseEntity<CategoryProductResponse> getCategoryProducts(
    5 -        @AuthenticationPrincipal() CustomUserDetails customUserDetails,
    6 -        @RequestParam Long categoryId,
    7 -        @RequestParam(defaultValue = "0") int page,
    8 -        @RequestParam(defaultValue = "10") int size
    9 -    ) {
   10 -        // 비로그인 사용자도 접근 가능하도록 수정
   11 -        Long userId = (customUserDetails != null) ? customUserDetails.getUser().getId() : null;
   12 -
   13 -        Category category = categoryService.findByIdWithChildren(categoryId);
   14 -        Page<ProductResponseDto> products = productService.getProductsByCategory(userId, category,
   15 -            page,
   16 -            size);
   17 -
   18 -        return ResponseEntity.ok(new CategoryProductResponse(products));
   19 -    }
   20 +    @GetMapping("/category")
   21 +    public ResponseEntity<Page<ProductSummaryDto>> getCategoryProducts(
   22 +        @AuthenticationPrincipal() CustomUserDetails customUserDetails,
   23 +        @RequestParam Long categoryId,
   24 +        @RequestParam(defaultValue = "0") int page,
   25 +        @RequestParam(defaultValue = "10") int size
   26 +    ) {
   27 +        // 비로그인 사용자도 접근 가능하도록 수정
   28 +        Long userId = (customUserDetails != null) ? customUserDetails.getUser().getId() : null;
   29 +
   30 +        Category category = categoryService.findByIdWithChildren(categoryId);
   31 +        Page<ProductSummaryDto> products = productService.getProductsByCategory(userId, category,
   32 +            page,
   33 +            size);
   34 +
   35 +        return ResponseEntity.ok(products);
   36 +    }

```

## 기대 효과

- 네트워크 I/O 감소: DB에서 애플리케이션 서버로 전송되는 데이터의 양이 줄어들어, 네트워크 지연 시간을 감소시키고 응답 속도를 향상.
- JPA 관리 오버헤드 제거: 더 이상 영속성 컨텍스트에서 엔티티를 관리하지 않으므로, 메모리 사용량과 CPU 소모가 줄어들어 서버의 전체 처리량(TPS) 증가.