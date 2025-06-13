const fs = require('fs');
const glob = require('glob');
const path = require('path');
const MarkdownIt = require('markdown-it');
const puppeteer = require('puppeteer');

const PROJECT_ROOT = path.resolve(__dirname);
const POSTING_DIR = path.join(PROJECT_ROOT, 'posting');
const BLOG_NAME = process.env.BLOG_NAME || 'ahpicl';

// GitHub Actions 에서 전달된 파일 목록 처리
const files = process.env.FILES
    ? process.env.FILES.split('\n').map(f =>
        path.join(POSTING_DIR, f.replace(/^posting\//, ''))
    )
    : glob.sync('**/*.md', { cwd: POSTING_DIR, absolute: true });

const md = new MarkdownIt();

// 폴더명 → 티스토리 카테고리 매핑
const CATEGORY_MAP = {
    'WIL': 'WIL',
    'DataStruct': '자료 구조',
    'Algorithm': 'Algorithm',
    'CSAPP': 'CS:APP',
    'Spring': 'Spring',
    'React': 'React',
    'Jungle': 'Jungle',
    'OS': '운영체제',
    // …필요한 카테고리 추가
};

(async () => {
    const browser = await puppeteer.launch({
        executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    });
    const page = await browser.newPage();

    // 1) 카카오 로그인 페이지
    const KAKAO_LOGIN_URL =
        'https://accounts.kakao.com/login/?continue=' +
        encodeURIComponent('https://www.tistory.com/auth/kakao/redirect');

    await page.goto(KAKAO_LOGIN_URL, { waitUntil: 'networkidle2' });
    // 로그인 폼 로딩 대기
    await page.waitForSelector('input#loginId--1', { visible: true });
    // 아이디/비밀번호 입력
    await page.type('input#loginId--1', process.env.TISTORY_ID, { delay: 20 });
    await page.type('input#password--2', process.env.TISTORY_PASSWORD, { delay: 20 });
    // 로그인 버튼 클릭
    await page.click('button.submit');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // 2) MD 파일들 순회
    for (const absolutePath of files) {
        const relPath = path.relative(POSTING_DIR, absolutePath);
        const folder = relPath.split(path.sep)[0];
        const category = CATEGORY_MAP[folder] || '';

        const raw = fs.readFileSync(absolutePath, 'utf-8');
        // 첫 번째 H1 제목 추출
        const lines = raw.split('\n');
        let title = '', found = false, bodyLines = [];
        for (const line of lines) {
            if (!found && line.startsWith('# ')) {
                title = line.slice(2).trim();
                found = true;
            } else {
                bodyLines.push(line);
            }
        }
        const html = md.render(bodyLines.join('\n'));

        // 3) 새 글쓰기 페이지
        await page.goto(
            `https://${BLOG_NAME}.tistory.com/manage/new/post`,
            { waitUntil: 'networkidle2' }
        );

        // 에디터 완전 로딩 대기
        await page.waitForSelector('textarea#post-title-inp', { visible: true });

        // 4) 제목 입력
        await page.click('textarea#post-title-inp');
        await page.type('textarea#post-title-inp', title, { delay: 20 });

        // 5) 카테고리 선택
        await page.click('#category-btn');
        await page.waitForSelector('#category-list .mce-menu-item', { visible: true });
        await page.evaluate(cat => {
            document
                .querySelectorAll('#category-list .mce-menu-item')
                .forEach(li => {
                    if (li.textContent.trim() === cat) {
                        li.click();
                    }
                });
        }, category);

        // 6) 본문 입력 (iframe 내부)
        const frameHandle = await page.$('#editor-tistory_ifr');
        const frame = await frameHandle.contentFrame();
        await frame.waitForSelector('body', { visible: true });
        await frame.evaluate((content) => {
            document.body.innerHTML = content;
        }, html);

        // 7) 발행 버튼 클릭 (완료 → 비공개 저장)
        await page.click('#publish-layer-btn');
        await page.waitForSelector('#publish-btn', { visible: true });
        await page.click('#publish-btn');
        // 발행 후 관리 페이지로 리다이렉션 대기
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        console.log(`✅ [${category}] "${title}" 게시 완료`);
    }

    await browser.close();
})();
