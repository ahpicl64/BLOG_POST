// post_to_tistory.js

const fs = require('fs');
const glob = require('glob');
const path = require('path');
const fm = require('front-matter');
const yaml = require('js-yaml');
const MarkdownIt = require('markdown-it');
const puppeteer = require('puppeteer');

const PROJECT_ROOT = path.resolve(__dirname);
const POSTING_DIR = path.join(PROJECT_ROOT, 'posting');
const BLOG_NAME = process.env.BLOG_NAME || 'ahpicl';

// 변경된 파일만 처리 (GitHub Actions에서 전달)
const files = process.env.FILES
    ? process.env.FILES
        .split('\n')
        .map(f => path.join(POSTING_DIR, f.replace(/^posting\//, '')))
        .filter(f => fs.existsSync(f))
    : glob.sync('**/*.md', { cwd: POSTING_DIR, absolute: true });

const md = new MarkdownIt();
const CATEGORY_MAP = {
    'WIL': 'WIL',
    'DataStruct': '자료 구조',
    'Algorithm': 'Algorithm',
    'CSAPP': 'CS:APP',
    'Spring': 'Spring',
    'React': 'React',
    'Jungle': 'Jungle',
    'OS': '운영체제'
    // …필요한 카테고리 추가
};

(async () => {
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/google-chrome-stable', // CI 환경의 Chrome
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // 1) 로그인 (카카오 연동)
    // (기존) 티스토리 로그인 폼 직접 사용
    await page.goto('https://www.tistory.com/auth/login', { waitUntil: 'networkidle2' });

    // “카카오계정으로 로그인” 버튼 클릭
    await page.click('.btn_login.link_kakao_id');
    // 폼이 바뀔 때까지 대기 (카카오 폼의 아이디 입력란이 보여질 때까지)
    await page.waitForSelector('input#loginId--1', { visible: true });
    // await page.goto(KAKAO_LOGIN_URL, { waitUntil: 'networkidle2' });
    // 3) 실제 카카오 로그인 폼에 아이디/비번 입력
    await page.type('input#loginId--1', process.env.TISTORY_ID, {
        delay: 20
    });
    await page.type('input#password--2', process.env.TISTORY_PASSWORD, {
        delay: 20
    });
    await page.click('button.submit');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // 2) 파일별 처리
    for (const absolutePath of files) {
        const relPath = path.relative(POSTING_DIR, absolutePath);
        const folder = relPath.split(path.sep)[0];
        const category = CATEGORY_MAP[folder] || '';

        // front-matter 파싱
        const raw = fs.readFileSync(absolutePath, 'utf-8');
        const { attributes, body } = fm(raw);
        let postId = attributes.postId || null;

        // 제목, 본문 준비
        const lines = body.split('\n');
        const titleLineIdx = lines.findIndex(l => l.match(/^#\s+/));
        const title = attributes.title
            || (titleLineIdx >= 0
                ? lines[titleLineIdx].replace(/^#\s+/, '').trim()
                : '');
        const bodyMd = lines
            .filter((_, i) => i !== titleLineIdx)
            .join('\n')
            .trim();
        const contentHtml = md.render(bodyMd);

        // 3) 신규 vs 수정 페이지 열기
        if (postId) {
            // 수정
            await page.goto(
                `https://${BLOG_NAME}.tistory.com/manage/newpost/${postId}?type=post&returnURL=ENTRY`,
                { waitUntil: 'networkidle2' }
            );
        } else {
            // 신규
            await page.goto(
                `https://${BLOG_NAME}.tistory.com/manage/new/post`,
                { waitUntil: 'networkidle2' }
            );
        }

        // 4) 제목 입력
        await page.click('textarea#post-title-inp');
        await page.type('textarea#post-title-inp', title, { delay: 20 });

        // 5) 카테고리 선택
        await page.click('#category-btn');
        await page.waitForSelector('#category-list');
        await page.evaluate(cat => {
            document
                .querySelectorAll('#category-list .mce-menu-item')
                .forEach(el => {
                    if (el.textContent.trim() === cat) el.click();
                });
        }, category);

        // 6) 본문 입력
        const frameHandle = await page.$('#editor-tistory_ifr');
        const frame = await frameHandle.contentFrame();
        await frame.evaluate(html => {
            document.body.innerHTML = html;
        }, contentHtml);

        // 7) 발행/저장 & postId 추출
        await page.click('#publish-layer-btn');
        await page.waitForSelector('#publish-btn');
        // 기다리며 내부 API 요청을 가로채 postId를 읽어 옵니다.
        const responsePromise = page.waitForResponse(resp =>
            resp.url().includes('/manage/postWriteProc.json') && resp.status() === 200
        );
        await page.click('#publish-btn');
        const apiResponse = await responsePromise;
        const data = await apiResponse.json();
        const newPostId = data.tistory?.postId;
        if (newPostId) postId = newPostId;

        // 8) 신규 등록 시 front-matter 갱신
        if (!attributes.postId && postId) {
            const newAttrs = { ...attributes, postId, title };
            const newRaw = [
                '---',
                yaml.dump(newAttrs).trim(),
                '---',
                '',
                `# ${title}`,
                bodyMd
            ].join('\n');
            fs.writeFileSync(absolutePath, newRaw, 'utf-8');
            console.log(`⚙️ postId(${postId}) 기록: ${relPath}`);
        }

        // 9) 실제 글 URL로 이동(선택)
        const postUrl = `https://${BLOG_NAME}.tistory.com/${postId}`;
        await page.goto(postUrl, { waitUntil: 'networkidle2' });

        console.log(`✅ [${category}] "${title}" ${attributes.postId ? '수정' : '신규'} 완료 → ${postUrl}`);
    }

    await browser.close();
})();
