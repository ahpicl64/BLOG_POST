// post_to_tistory.js
const fs = require('fs');
const glob = require('glob');
const path = require('path');
const MarkdownIt = require('markdown-it');
const puppeteer = require('puppeteer');

const PROJECT_ROOT = path.resolve(__dirname);
const POSTING_DIR = path.join(PROJECT_ROOT, 'posting');
const COOKIE_PATH = path.join(PROJECT_ROOT, 'cookies.json');
const BLOG_NAME = process.env.BLOG_NAME || 'ahpicl';

const HEADLESS = process.env.HEADLESS !== 'false';
const CHROME_PATH = process.env.CHROME_PATH
    || (process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : '/usr/bin/google-chrome-stable');

// 변경된 파일 목록 or 전체 .md
const files = process.env.FILES
    ? process.env.FILES.split('\n').map(f => path.join(POSTING_DIR, f.replace(/^posting\//, '')))
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
    'OS': '운영체제',
    // …필요한 카테고리 추가
};

// 전역 에러 핸들링
process.on('unhandledRejection', err => {
    console.error('❌ UnhandledRejection:', err);
    process.exit(1);
});
process.on('uncaughtException', err => {
    console.error('❌ UncaughtException:', err);
    process.exit(1);
});

(async () => {
    try {
        const browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            headless: HEADLESS ? 'new' : false,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        page.on('error', err => console.error('🚨 Page error:', err));
        page.on('pageerror', err => console.error('🚨 Page script error:', err));

        // ① 쿠키 로드
        if (fs.existsSync(COOKIE_PATH)) {
            const saved = JSON.parse(fs.readFileSync(COOKIE_PATH, 'utf-8'));
            await page.setCookie(...saved);
            console.log('➡️ 세션 쿠키 로드 완료');
        } else if (!HEADLESS) {
            // ② 수동 로그인 & 쿠키 저장 (GUI 모드)
            const loginUrl =
                'https://accounts.kakao.com/login/?continue=' +
                encodeURIComponent('https://www.tistory.com/auth/kakao/redirect');
            await page.goto(loginUrl, { waitUntil: 'networkidle2' });
            console.log('📝 GUI 창에서 로그인 후 Enter 키를 눌러 계속하세요…');
            await page.waitForSelector('input#loginId--1', { visible: true });
            await new Promise(resolve => process.stdin.once('data', resolve));
            const cookies = await page.cookies();
            fs.writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
            console.log('💾 로그인 쿠키 저장 완료:', COOKIE_PATH);
        }

        // ③ MD 파일 순회
        for (const absolutePath of files) {
            const relPath = path.relative(POSTING_DIR, absolutePath);
            const folder = relPath.split(path.sep)[0];
            const category = CATEGORY_MAP[folder] || '';

            // 제목/본문 분리
            const raw = fs.readFileSync(absolutePath, 'utf-8');
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

            // ④ 새 글쓰기 페이지
            await page.goto(
                `https://${BLOG_NAME}.tistory.com/manage/new/post`,
                { waitUntil: 'networkidle2' }
            );

            // ⑤ 제목 입력
            await page.waitForSelector('textarea#post-title-inp', { visible: true });
            await page.click('textarea#post-title-inp');
            await page.type('textarea#post-title-inp', title, { delay: 20 });

            // ⑥ 카테고리 선택
            await page.click('#category-btn');
            await page.waitForSelector('#category-list .mce-menu-item', { visible: true });
            await page.evaluate(cat => {
                document
                    .querySelectorAll('#category-list .mce-menu-item')
                    .forEach(li => {
                        if (li.textContent.trim() === cat) li.click();
                    });
            }, category);

            // ⑦ 본문 입력 (iframe)
            const frameHandle = await page.$('#editor-tistory_ifr');
            const frame = await frameHandle.contentFrame();
            await frame.waitForSelector('body', { visible: true });
            await frame.evaluate(content => {
                document.body.innerHTML = content;
            }, html);

            // ⑧ 발행 (완료 → 비공개 저장)
            await page.click('#publish-layer-btn');
            await page.waitForSelector('#publish-btn', { visible: true });
            await page.click('#publish-btn');
            await page.waitForNavigation({ waitUntil: 'networkidle2' });

            console.log(`✅ [${category}] "${title}" 게시 완료`);
        }

        await browser.close();
    } catch (e) {
        console.error('❌ 에러 발생:', e);
        process.exit(1);
    }
})();
