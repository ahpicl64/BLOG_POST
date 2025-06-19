# 티스토리 자동 포스팅 도구

이 프로젝트는 마크다운(.md) 파일을 티스토리 블로그에 자동으로 포스팅하는 도구입니다. GitHub Actions와 Puppeteer를 활용하여 마크다운 파일이 변경될 때마다 자동으로 티스토리에 글을 발행하거나 수정합니다.

## 주요 기능

- 마크다운 파일을 티스토리 블로그 포스트로 자동 변환
- 이미지 파일을 Base64로 인코딩하여 포스트에 포함
- 카테고리 자동 설정
- 신규 글 발행 및 기존 글 수정 지원
- GitHub Actions를 통한 자동화 배포
- 인간과 유사한 행동 패턴으로 봇 탐지 회피

## 폴더 구조

```
blog_post/
├── .github/workflows/       # GitHub Actions 워크플로우 설정
├── posting/                 # 블로그 포스트 마크다운 파일 저장 폴더
├── post_map.json           # 포스트 ID 매핑 파일
├── post_to_tistory.js      # 메인 스크립트
└── .env                    # 환경 변수 설정 파일 (로컬 실행용)
```

## 설치 및 실행 방법

### 필요 조건

- Node.js 16 이상
- npm 또는 yarn
- Google Chrome 브라우저 (로컬 실행 시)

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

3. `.env` 파일 생성 및 설정(로컬 전용)

   ```
   BLOG_NAME=your-blog-name
   TISTORY_ID=your-tistory-id
   TISTORY_PASSWORD=your-tistory-password
   HEADLESS=false  # 브라우저 표시 여부 (true/false)
   ```

4. 실행

   ```bash
   npm start
   ```

### GitHub Actions 설정

GitHub Actions를 통해 자동화하려면 다음 시크릿을 저장소 설정에 추가해야 합니다:

- `TISTORY_ID`: 티스토리 로그인 아이디
- `TISTORY_PASSWORD`: 티스토리 로그인 비밀번호
- `TISTORY_COOKIES_JSON`: (선택사항) 티스토리 로그인 쿠키 JSON 문자열

## 마크다운 파일 작성 방법

1. `posting` 폴더 내 적절한 카테고리 폴더에 마크다운 파일을 생성합니다.
2. 파일 첫 줄에 `# 제목` 형식으로 포스트 제목을 작성합니다.
3. 이미지는 상대 경로로 참조합니다. (예: `![이미지 설명](image.png)`)

## 카테고리 매핑

마크다운 파일이 위치한 폴더에 따라 자동으로 티스토리 카테고리가 설정됩니다:

### ex

- `WIL` → WIL
- `DataStruct` → 자료 구조
- `Algorithm` → Algorithm
- `CSAPP` → CS:APP
- `Spring` → Spring
- `React` → React
- `Jungle` → Jungle
- `OS` → 운영체제
- `etc` → 기타등등

## 주의사항

- 2단계 인증이나 CAPTCHA가 필요한 경우 로컬에서 실행하여 수동으로 처리해야 할 수 있습니다.
- 티스토리 로그인 정보는 안전하게 관리하세요.
- 이미지 파일이 너무 크면 변환 과정에서 문제가 발생할 수 있습니다.

## 라이선스

이 프로젝트는 개인 사용 목적으로 제작되었습니다.
