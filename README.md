# 티스토리 자동 포스팅 도구

이 프로젝트는 마크다운(.md) 파일을 티스토리 블로그에 자동으로 포스팅하는 도구입니다. GitHub Actions와 Puppeteer를 활용하여 마크다운 파일이 변경될 때마다 자동으로 티스토리에 글을 발행하거나 수정합니다. 로컬 환경에서의 수동 포스팅과 클립보드 복사 기능도 지원합니다.

## 주요 기능

- 마크다운 파일을 티스토리 블로그 포스트로 자동 변환
- 이미지 파일을 Base64로 인코딩하여 포스트에 포함
- 카테고리 자동 설정 (폴더 구조 기반)
- 신규 글 발행 및 기존 글 수정 지원
- GitHub Actions를 통한 자동화 배포
- 인간과 유사한 행동 패턴으로 봇 탐지 회피
- 클립보드 복사 기능 (마크다운을 HTML로 변환)

## 사용 가능한 스크립트

이 프로젝트는 세 가지 주요 스크립트를 제공합니다:

1. **자동 포스팅 (post_to_tistory.js)**
   - GitHub Actions에서 자동으로 실행되어 마크다운 파일을 티스토리에 포스팅
   - 로컬에서도 실행 가능 (`npm start`)
   - Headless 모드로 동작 (브라우저 화면 표시 없음)

2. **수동 포스팅 (man_post.js)**
   - 로컬에서 브라우저를 표시하며 실행 (CAPTCHA 해결 등을 위해)
   - `node man_post.js` 명령으로 실행
   - 인간과 유사한 타이핑 패턴 사용
   - 단일 또는 다중 게시글 포스팅 지원

3. **클립보드 복사 (clipboard_helper.js)**
   - 마크다운 파일을 HTML로 변환하여 클립보드에 복사
   - 이미지는 GitHub 링크로 대체
   - `npm run copy 파일경로` 명령으로 실행

## 폴더 구조

```
blog_post/
├── .github/workflows/       # GitHub Actions 워크플로우 설정
├── posting/                 # 블로그 포스트 마크다운 파일 저장 폴더
│   ├── Algorithm/           # 알고리즘 카테고리 포스트
│   ├── CSAPP/              # CS:APP 카테고리 포스트
│   ├── DataStruct/         # 자료 구조 카테고리 포스트
│   └── ...                 # 기타 카테고리 폴더
├── post_map.json           # 포스트 ID 매핑 파일 (로컬 ID와 티스토리 ID 매핑)
├── post_to_tistory.js      # 자동 포스팅 스크립트 (GitHub Actions용)
├── man_post.js             # 수동 포스팅 스크립트 (로컬 실행용)
├── clipboard_helper.js     # 클립보드 복사 스크립트
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

### 스크립트 실행 방법

#### 1. 자동 포스팅 (GitHub Actions 또는 로컬)

```bash
# 로컬에서 실행
npm start
```

이 명령은 `posting` 디렉토리의 모든 마크다운 파일을 처리하고, 새로운 파일은 새 포스트로 발행하고 기존 파일은 업데이트합니다.

#### 2. 수동 포스팅 (로컬 전용, 브라우저 표시)

```bash
# 모든 마크다운 파일 처리 (기본)
node man_post.js

# 특정 파일만 처리
node man_post.js posting/카테고리/파일명.md

# 특정 카테고리의 모든 파일 처리
node man_post.js posting/카테고리/
```

수동 포스팅은 다음과 같은 경우에 유용합니다:
- CAPTCHA 해결이 필요할 때
- 2단계 인증이 필요할 때
- 포스팅 과정을 직접 확인하고 싶을 때
- 특정 파일이나 카테고리만 선택적으로 포스팅하고 싶을 때

#### 3. 클립보드 복사 (마크다운 → HTML)

클립보드 복사 기능을 사용하려면 먼저 package.json에 스크립트가 등록되어 있어야 합니다:

```json
{
  "scripts": {
    "copy": "node clipboard_helper.js"
  }
}
```

이미 등록되어 있다면, 다음과 같이 사용할 수 있습니다:

```bash
# 특정 마크다운 파일을 HTML로 변환하여 클립보드에 복사
npm run copy posting/카테고리/파일명.md
```

이 명령을 실행하면:
1. 지정된 마크다운 파일이 HTML로 변환됩니다
2. 이미지 경로가 GitHub 저장소 URL로 대체됩니다
3. 변환된 HTML이 클립보드에 복사됩니다
4. 티스토리 에디터에 직접 붙여넣기할 수 있습니다

## 스크립트 동작 원리

### 1. 자동 포스팅 (post_to_tistory.js)

이 스크립트는 다음과 같은 과정으로 동작합니다:

1. `posting` 디렉토리에서 마크다운 파일을 검색
2. 각 파일의 내용을 읽고 마크다운을 HTML로 변환
3. 이미지 파일을 Base64로 인코딩
4. 티스토리에 로그인 (쿠키 사용 또는 ID/PW 입력)
5. 포스트 작성 페이지로 이동
6. 제목, 내용, 카테고리 설정
7. 발행 또는 수정 버튼 클릭
8. `post_map.json` 파일 업데이트 (로컬 파일 경로와 티스토리 포스트 ID 매핑)

### 2. 수동 포스팅 (man_post.js)

자동 포스팅과 유사하지만 다음과 같은 차이점이 있습니다:

1. 브라우저가 화면에 표시됨 (Headless=false)
2. 인간과 유사한 타이핑 패턴 사용 (봇 탐지 회피)
3. reCAPTCHA 플러그인 활성화
4. 수동 개입이 필요한 경우 사용자가 직접 조작 가능
5. 명령줄 인수를 통해 특정 파일이나 디렉토리만 처리 가능

**수동 포스팅 사용 시나리오:**

- **단일 게시글 포스팅**: `node man_post.js posting/카테고리/파일명.md`
- **특정 카테고리 포스팅**: `node man_post.js posting/카테고리/`
- **모든 게시글 포스팅**: `node man_post.js`

수동 포스팅 중 CAPTCHA나 2단계 인증이 나타나면 직접 해결한 후 프로세스가 계속 진행됩니다.

### 3. 클립보드 복사 (clipboard_helper.js)

이 스크립트는 다음과 같이 동작합니다:

1. 지정된 마크다운 파일을 읽음
2. 마크다운을 HTML로 변환
3. 이미지 경로를 GitHub 저장소 URL로 변환
4. 변환된 HTML을 클립보드에 복사
5. 티스토리 에디터에 직접 붙여넣기 가능

**클립보드 복사 사용 시나리오:**

- 자동 포스팅이 실패하는 경우
- 티스토리 에디터에서 직접 편집하고 싶은 경우
- 이미지를 Base64로 변환하지 않고 GitHub 링크로 사용하고 싶은 경우

## 카테고리 매핑 시스템

마크다운 파일이 위치한 폴더에 따라 자동으로 티스토리 카테고리가 설정됩니다. 매핑은 코드 내의 `CATEGORY_MAP` 객체에 정의되어 있습니다:

```javascript
const CATEGORY_MAP = {
    'WIL': 'WIL',
    'DataStruct': '자료 구조',
    'Algorithm': 'Algorithm',
    'CSAPP': 'CS:APP',
    'Spring': 'Spring',
    'React': 'React',
    'Jungle': 'Jungle',
    'OS': '운영체제',
    'etc': '기타등등'
};
```

새로운 카테고리를 추가하려면:
1. 티스토리 블로그에서 해당 카테고리를 먼저 생성
2. `post_to_tistory.js`와 `man_post.js` 파일에서 `CATEGORY_MAP` 객체에 매핑 추가
3. `posting` 디렉토리에 해당 카테고리 이름의 폴더 생성

## GitHub Actions 설정

GitHub Actions를 통해 자동화하려면 다음 단계를 따르세요:

1. 저장소 설정에서 다음 시크릿을 추가:
   - `TISTORY_ID`: 티스토리 로그인 아이디
   - `TISTORY_PASSWORD`: 티스토리 로그인 비밀번호
   - `TISTORY_COOKIES_JSON`: (선택사항) 티스토리 로그인 쿠키 JSON 문자열

2. `.github/workflows/` 디렉토리에 워크플로우 파일 생성:

```yaml
name: Tistory Auto Posting

on:
  push:
    branches: [ main ]
    paths:
      - 'posting/**/*.md'  # posting 폴더의 마크다운 파일이 변경될 때만 실행

jobs:
  post:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '16'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run posting script
        env:
          TISTORY_ID: ${{ secrets.TISTORY_ID }}
          TISTORY_PASSWORD: ${{ secrets.TISTORY_PASSWORD }}
          TISTORY_COOKIES_JSON: ${{ secrets.TISTORY_COOKIES_JSON }}
          HEADLESS: 'true'
        run: node post_to_tistory.js
        
      - name: Commit updated post_map.json
        run: |
          git config --global user.name 'GitHub Actions'
          git config --global user.email 'actions@github.com'
          git add post_map.json
          git commit -m "Update post_map.json" || echo "No changes to commit"
          git push
```

이 워크플로우는 `posting` 폴더의 마크다운 파일이 변경될 때마다 자동으로 실행됩니다.

## 마크다운 파일 작성 방법

1. `posting` 폴더 내 적절한 카테고리 폴더에 마크다운 파일을 생성합니다.
2. 파일 첫 줄에 `# 제목` 형식으로 포스트 제목을 작성합니다.
3. 이미지는 상대 경로로 참조합니다. (예: `![이미지 설명](image.png)`)
4. 이미지 파일은 마크다운 파일과 같은 디렉토리에 위치해야 합니다.

예시:
```markdown
# 자바스크립트 비동기 프로그래밍

이 글에서는 자바스크립트의 비동기 프로그래밍에 대해 알아봅니다.

## Promise 객체

Promise는 비동기 작업의 최종 완료 또는 실패를 나타내는 객체입니다.

![Promise 다이어그램](promise-diagram.png)

## async/await

ES2017에서 도입된 async/await 문법은...
```

## post_map.json 파일

`post_map.json` 파일은 로컬 마크다운 파일과 티스토리 포스트 ID를 매핑합니다. 이 파일은 자동으로 관리되며, 포스트가 수정될 때 올바른 티스토리 포스트를 업데이트하는 데 사용됩니다.

예시:
```json
{
  "posting/Algorithm/정렬_알고리즘.md": {
    "id": "123456",
    "url": "https://your-blog.tistory.com/123"
  },
  "posting/React/리액트_훅_사용법.md": {
    "id": "123457",
    "url": "https://your-blog.tistory.com/124"
  }
}
```

## 주의사항

- **2단계 인증/CAPTCHA**: 2단계 인증이나 CAPTCHA가 필요한 경우 `man_post.js`를 사용하여 로컬에서 실행하세요.
- **이미지 크기**: 이미지 파일이 너무 크면 Base64 변환 과정에서 문제가 발생할 수 있습니다. 가능한 최적화된 이미지를 사용하세요.
- **티스토리 정책**: 티스토리의 로그인 정책이 변경될 경우 스크립트가 작동하지 않을 수 있습니다.
- **보안**: 티스토리 로그인 정보는 안전하게 관리하세요. GitHub Actions 시크릿을 사용하여 보호하세요.
- **쿠키 관리**: 쿠키를 사용하는 경우 주기적으로 갱신해야 할 수 있습니다.

## 문제 해결

### 로그인 실패
- 티스토리 ID/PW가 올바른지 확인
- 2단계 인증이 활성화되어 있는지 확인
- `man_post.js`로 수동 로그인 시도

### 이미지 로딩 실패
- 이미지 경로가 올바른지 확인
- 이미지 크기가 너무 큰지 확인
- 지원되는 이미지 형식인지 확인 (jpg, png, gif 등)

### GitHub Actions 실패
- 저장소 시크릿이 올바르게 설정되었는지 확인
- 워크플로우 파일 구문이 올바른지 확인
- Actions 로그 확인

### 클립보드 복사 실패
- `npm run copy` 명령이 package.json에 등록되어 있는지 확인
- 파일 경로가 올바른지 확인
- 운영체제의 클립보드 접근 권한 확인

## 라이선스

이 프로젝트는 개인 사용 목적으로 제작되었습니다.

## 기여

버그 리포트, 기능 요청, 풀 리퀘스트는 언제나 환영합니다. 프로젝트를 개선하는 데 도움을 주세요!
