# 옷장 페이지 구현 (Closet)

분류: TypeScript, next.js
일정: 2025년 7월 1일

## 작업 순서

1. 타입 정의 추가
2. API 연동 구현
3. 상태 관리 (Zustand) 추가
4. 반응형 디자인 적용
5. 인터랙션 기능 구현

## 필요한 컴포넌트

**기존 컴포넌트 재사용:**

- `ProductCard`: 찜 목록 섹션에서 활용
- `AvatarModal`: 아바타 생성 기능에 활용
- `BlackButton`, `Tag`: 필요시 활용 가능

**새로 만든 컴포넌트:**

- `ClosetHeader`: 헤더 전용 컴포넌트
- `CurrentOutfitSidebar`: 현재 착장 사이드바
- `OutfitCard`: 저장된 착장 카드 (새로운 디자인)
- `SavedOutfitsSection`: 저장된 착장 섹션
- `WishlistSection`: 찜 목록 섹션 (ProductCard 활용)