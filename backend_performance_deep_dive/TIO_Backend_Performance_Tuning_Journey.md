# K6 부하 테스트 기반 백엔드 성능 병목 분석 및 점진적 최적화

## 배경 및 문제정의

- **목표**: TIO(Try-it-on) 프로젝트의 백엔드 안정성 및 확장성 검증.
- **테스트 환경**: k6를 사용하여 실제 사용자 시나리오(로그인, 상품조회, 주문 등) 기반의 부하 테스트 실행. (최대 동시 사용자 40명, 22분간)
- **초기 문제 상황**: 테스트 실행 직후, 심각한 성능 저하와 함께 시스템 장애 발생.
    - **API 성공률**: 12.9%
    - **평균 응답 시간**: 27.21초
    - **인프라 상태**: EC2 인스턴스 CPU 사용률 100% 도달 후 서비스 다운.

![k6 실패 결과](images/k6_failure_result.png)

## 접근방식

시스템 장애의 근본 원인을 찾기 위해, 애플리케이션과 데이터베이스 두 가지 계층으로 나누어 단계적인 분석 및 최적화를 진행함.

### 1단계: 애플리케이션 레벨 분석 및 최적화 (JPA N+1 문제)

- **원인 분석**: 서버 로그 분석 결과, 단일 API 요청에 대해 100개가 넘는 SQL 쿼리가 발생하는 것을 확인. 이는 JPA의 지연 로딩(Lazy Loading)으로 인해 연관된 엔티티를 조회할 때마다 추가 쿼리가 발생하는 전형적인 **N+1 문제**였음.
- **해결 전략**: 불필요한 쿼리 발생을 원천적으로 차단하기 위해, `Fetch Join`과 `@EntityGraph`를 사용하여 연관 관계의 엔티티들을 한 번의 쿼리로 함께 조회하도록 수정.

### 2단계: 데이터베이스 레벨 분석 및 최적화 (비효율적인 쿼리 실행)

- **추가 문제 발견**: N+1 문제 해결 후에도 특정 API에서 RDS CPU 사용률이 99%에 도달하는 2차 병목 현상 발견.
- **원인 분석**: AWS Performance Insights를 통해 부하의 원인이 되는 특정 SQL 쿼리를 식별. 해당 쿼리는 `WHERE` 절의 `OR` 조건과 `ORDER BY` 절의 정렬 기준 컬럼이 인덱스를 타지 못해, 대량의 데이터에 대한 **Filesort**를 유발하며 과도한 CPU 자원을 소모하고 있었음.
- **해결 전략**:
    1.  **커버링 인덱스(Covering Index) 적용**: 쿼리의 `WHERE`와 `ORDER BY` 절에 사용되는 모든 컬럼을 포함하는 복합 인덱스를 생성하여, 테이블 접근 없이 인덱스만으로 쿼리를 완료하도록 최적화.
    2.  **JPQL 프로젝션(Projection) 도입**: 엔티티가 아닌 DTO로 직접 결과를 조회하여 JPA 영속성 컨텍스트의 관리 오버헤드를 제거하고 애플리케이션의 메모리 효율성을 증대.

## 실제 구현

### 1. N+1 문제 해결 (Fetch Join)

- ProductRepository에 Fetch Join을 적용하여 Product 조회 시 Category 정보를 함께 로드.

```java
// ProductRepository.java
@Query("SELECT p FROM Product p JOIN FETCH p.category c WHERE p.deleted = false ORDER BY p.wishlistCount DESC")
List<Product> findTop100WithCategory(Pageable pageable);
```

### 2. 커버링 인덱스 생성 (SQL)

- Filesort를 유발하던 쿼리의 `WHERE` 및 `ORDER BY` 조건에 맞춰 커버링 인덱스 생성.

```sql
-- product 테이블에 커버링 인덱스 추가
CREATE INDEX idx_product_ranking_covering
ON product (deleted, category_id, parent_category_id, wishlist_count DESC, create_at DESC);
```

### 3. JPQL 프로젝션 구현

- Repository에서 DTO 생성자를 직접 호출하여 필요한 데이터만 조회.

```java
// ProductRepository.java
@Query("SELECT new com.tryiton.core.product.dto.ProductSummaryDto(p.id, p.productName, p.img1, p.price, p.sale, p.brand, p.wishlistCount, p.createAt) " +
        "FROM Product p WHERE p.deleted = false AND " +
        "(p.category.id = :categoryId OR p.category.parentCategory.id = :categoryId)")
Page<ProductSummaryDto> findSummaryByCategoryHierarchy(@Param("categoryId") Long categoryId, Pageable pageable);
```

## 후속 고려사항

- **캐싱 전략 도입**: 현재 DB 부하의 상당 부분이 읽기 작업에서 발생하므로, Redis와 같은 인메모리 캐시를 도입하여 자주 조회되지만 변경 빈도가 낮은 데이터를 캐싱. 이를 통해 DB 부하를 추가적으로 경감하고 응답 속도를 향상시킬 수 있음.
- **읽기 전용 복제본(Read Replica) 구성**: 쓰기 작업과 읽기 작업을 분리하기 위해 RDS에 읽기 전용 복제본을 구성. 복잡한 분석 쿼리나 대량의 읽기 요청을 복제본으로 분산시켜 마스터 DB의 부하를 줄이고 전체 시스템의 안정성을 높일 수 있음.
- **지속적인 모니터링 및 알림**: CloudWatch, Grafana 등을 활용하여 주요 성능 지표(CPU, Memory, TPS, Latency)에 대한 대시보드를 구축하고, 임계치 초과 시 알림을 받는 시스템을 구성하여 장애를 사전에 예방.