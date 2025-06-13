const fs = require('fs');
const glob = require('glob');
const path = require('path');
const MarkdownIt = require('markdown-it');
const puppeteer = require('puppeteer');

const PROJECT_ROOT = path.resolve(__dirname);
const POSTING_DIR = path.join(PROJECT_ROOT, 'posting');
const BLOG_NAME = process.env.BLOG_NAME || 'ahpicl';

const md = new MarkdownIt();
// 폴더명 → 티스토리 카테고리 이름 매핑
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
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // 카카오 로그인 페이지로 리디렉트
    const KAKAO_LOGIN_URL =
        'https://accounts.kakao.com/login/?continue=' +
        encodeURIComponent('https://www.tistory.com/auth/kakao/redirect');

    // 1) 로그인
    await page.goto(KAKAO_LOGIN_URL, { waitUntil: 'networkidle2' });
    await page.type('input[name="#loginId--1"]', process.env.TISTORY_ID);
    await page.type('input[name="#password--2"]', process.env.TISTORY_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // 2) Markdown 파일 순회 (posting 폴더 기준)
    const files = glob.sync('**/*.md', {
        cwd: POSTING_DIR,
        absolute: true
    });

    for (const absolutePath of files) {
        const relPath = path.relative(POSTING_DIR, absolutePath);
        const folder = relPath.split(path.sep)[0];
        const category = CATEGORY_MAP[folder] || '';

        const raw = fs.readFileSync(absolutePath, 'utf-8');
        // 3) 첫 번째 h1(# )을 제목으로, 나머지는 본문으로
        const lines = raw.split('\n');
        let title = '';
        const bodyLines = [];
        let foundTitle = false;

        for (const line of lines) {
            if (!foundTitle && line.match(/^#\s+/)) {
                title = line.replace(/^#\s+/, '').trim();
                foundTitle = true;
            } else {
                bodyLines.push(line);
            }
        }

        const bodyMd = bodyLines.join('\n').trim();
        const contentHtml = md.render(bodyMd);

        // 4) 새 글쓰기 페이지 열기
        await page.goto(
            `https://${BLOG_NAME}.tistory.com/manage/new/post`,
            { waitUntil: 'networkidle2' }
        );

        // 5) 제목 입력
        await page.click('input.post-title');
        await page.type('input.post-title', title, { delay: 20 });

        // 6) 카테고리 선택
        await page.click('button.category-selector');
        await page.waitForSelector('ul.category-list');
        await page.evaluate(cat => {
            const items = Array.from(
                document.querySelectorAll('ul.category-list li')
            );
            const target = items.find(el => el.textContent.trim() === cat);
            if (target) target.click();
        }, category);

        // 7) 본문 입력 (iframe 내부)
        const frameHandle = await page.$('iframe.se2_iframe');
        const frame = await frameHandle.contentFrame();
        await frame.evaluate(html => {
            document.body.innerHTML = html;
        }, contentHtml);

        // 8) 발행
        await page.click('button.btn_publish');
        await page.waitForSelector('.toast-success', { timeout: 10000 });

        console.log(`✅ [${category}] "${title}" 게시 완료`);
    }

    await browser.close();
})();
