# 티스토리 자동 포스팅 도구

이 프로젝트는 마크다운(.md) 파일을 티스토리 블로그에 자동으로 포스팅하는 도구입니다. GitHub Actions와 Puppeteer를 활용하여 마크다운 파일이 변경될 때마다 자동으로 티스토리에 글을 발행하거나 수정합니다.

## 주요 기능

- 마크다운 파일을 티스토리 블로그 포스트로 자동 변환
- 이미지 파일을 GitHub raw URL로 변환하여 포함 (Base64 대신)
- 카테고리 자동 설정
- 신규 글 발행 및 기존 글 수정 지원
- GitHub Actions를 통한 자동화 배포
- **클립보드 복사 방식의 수동 포스팅 지원** ⭐ 추천
- 인간과 유사한 행동 패턴으로 봇 탐지 회피

## 사용 방법

### 1. 수동 포스팅 (클립보드 복사) ⭐ 추천
브라우저 자동화 없이 클립보드를 통해 간편하게 포스팅할 수 있습니다.

```bash
# 파일명으로 검색
npm run copy thymeleaf

# 또는 정확한 경로 지정
npm run copy posting/Spring/thymeleaf.md

# 또는 직접 실행
node clipboard_helper.js thymeleaf
```

**사용 순서:**
1. 위 명령어 실행 → HTML이 클립보드에 복사됨
2. 티스토리 관리자 → 글쓰기 이동
3. 에디터에서 **HTML 모드**로 전환
4. `Cmd+V` (Mac) 또는 `Ctrl+V` (Windows)로 붙여넣기
5. 카테고리와 제목 설정 (자동으로 안내됨)
6. 발행하기

### 2. 자동 포스팅 (GitHub Actions)
마크다운 파일을 `posting` 폴더에 추가하고 GitHub에 푸시하면 자동으로 티스토리에 포스팅됩니다.

### 3. 완전 자동 포스팅 (로컬)
```bash
# 특정 파일 자동 포스팅
node man_post.js thymeleaf

# 모든 파일 자동 포스팅
npm start
```

## 폴더 구조

```
blog_post/
├── .github/workflows/       # GitHub Actions 워크플로우 설정
├── posting/                 # 블로그 포스트 마크다운 파일 저장 폴더
├── post_map.json           # 포스트 ID 매핑 파일
├── post_to_tistory.js      # 메인 스크립트 (GitHub Actions용)
├── man_post.js             # 수동 실행 스크립트 (로컬용)
├── clipboard_helper.js     # 클립보드 복사 헬퍼 (NEW!)
└── .env                    # 환경 변수 설정 파일 (로컬 실행용)
```

## 설치 및 실행 방법

### 필요 조건

- Node.js 16 이상
- npm 또는 yarn

### 로컬 환경 설정

1. 저장소 클론

   ```bash
   git clone https://github.com/your-username/blog_post.git
   cd blog_post
   ```

2. 의존성 설치

   ```bash
   npm install
   ```

3. `.env` 파일 생성 및 설정(완전 자동화 사용 시에만 필요)

   ```
   BLOG_NAME=your-blog-name
   TISTORY_ID=your-tistory-id
   TISTORY_PASSWORD=your-tistory-password
   HEADLESS=false  # 브라우저 표시 여부 (true/false)
   ```

## 마크다운 파일 작성 방법

1. `posting` 폴더 내 적절한 카테고리 폴더에 마크다운 파일을 생성합니다.
2. 파일 첫 줄에 `# 제목` 형식으로 포스트 제목을 작성합니다.
3. 이미지는 상대 경로로 참조합니다. (예: `![이미지 설명](image.png)`)
   - 자동으로 GitHub raw URL로 변환됩니다.

## 카테고리 매핑

마크다운 파일이 위치한 폴더에 따라 자동으로 티스토리 카테고리가 설정됩니다:

- `WIL` → WIL
- `DataStruct` → 자료 구조
- `Algorithm` → Algorithm
- `CSAPP` → CS:APP
- `Spring` → Spring
- `React` → React
- `Jungle` → Jungle
- `OS` → 운영체제
- `etc` → 기타등등

## 장점

### 클립보드 방식의 장점
- ✅ 브라우저 자동화 없이 안전하게 사용
- ✅ CAPTCHA나 로그인 문제 없음
- ✅ 이미지가 GitHub raw URL로 변환되어 용량 문제 해결
- ✅ 빠르고 간단한 사용법
- ✅ 미리보기 가능

### 기존 자동화 방식 대비
- Base64 이미지 → GitHub raw URL로 개선
- 엄청난 길이의 문자열 문제 해결
- 파일 크기 최적화
- Git diff 가독성 향상

## 주의사항

- GitHub 저장소가 public이어야 raw URL이 작동합니다.
- 이미지 파일은 마크다운 파일과 함께 Git에 커밋되어야 합니다.
- 클립보드 복사는 현재 macOS만 지원합니다. (Windows/Linux는 수동으로 복사)

## 라이선스

이 프로젝트는 개인 사용 목적으로 제작되었습니다.
