const fs = require('fs');
const glob = require('glob');
const path = require('path');
const MarkdownIt = require('markdown-it');
const puppeteer = require('puppeteer');

const PROJECT_ROOT = path.resolve(__dirname);
const POSTING_DIR = path.join(PROJECT_ROOT, 'posting');
const BLOG_NAME = process.env.BLOG_NAME || 'ahpicl';
const HEADLESS = true;  // GitHub Actions 에선 무조건 headless
const CHROME_PATH = process.env.CHROME_PATH
    || (process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : '/usr/bin/google-chrome-stable');

// 대상 MD 파일 목록
const files = process.env.FILES
    ? process.env.FILES.split('\n').map(f =>
        path.join(POSTING_DIR, f.replace(/^posting\//, ''))
    )
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
};

// 전역 오류 처리
process.on('unhandledRejection', err => {
    console.error('❌ UnhandledRejection:', err);
    process.exit(1);
});
process.on('uncaughtException', err => {
    console.error('❌ UncaughtException:', err);
    process.exit(1);
});

(async () => {
    // 1) 브라우저 띄우기
    const browser = await puppeteer.launch({
        executablePath: CHROME_PATH,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    // 2) 환경변수로 주입된 쿠키 JSON 로드
    if (process.env.TISTORY_COOKIES_JSON) {
        let cookies;
        try {
            cookies = JSON.parse(process.env.TISTORY_COOKIES_JSON);
        } catch (e) {
            console.error('❌ TISTORY_COOKIES_JSON 파싱 오류:', e);
            process.exit(1);
        }
        await page.setCookie(...cookies);
        console.log('➡️ 세션 쿠키 설정 완료');
    } else {
        console.warn('⚠️ TISTORY_COOKIES_JSON이 설정되어 있지 않습니다. 로그인 없이 진행합니다.');
    }

    // 3) 카카오 리다이렉트로 로그인 세션 확인
    await page.goto(`https://${BLOG_NAME}.tistory.com/manage/new/post`, { waitUntil: 'networkidle2' });
    // (만약 세션이 만료돼서 로그인 페이지로 리다이렉트되면, 실패 로그가 뜹니다)

    // 4) MD 파일 순회
    for (const absolutePath of files) {
        // 제목/카테고리/본문 준비
        const relPath = path.relative(POSTING_DIR, absolutePath);
        const folder = relPath.split(path.sep)[0];
        const category = CATEGORY_MAP[folder] || '';

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

        // 5) 새 글쓰기 페이지
        await page.goto(`https://${BLOG_NAME}.tistory.com/manage/new/post`, { waitUntil: 'networkidle2' });

        // 6) 제목 입력
        await page.waitForSelector('textarea#post-title-inp', { visible: true });
        await page.click('textarea#post-title-inp');
        await page.type('textarea#post-title-inp', title, { delay: 20 });

        // 7) 카테고리 선택
        await page.click('#category-btn');
        await page.waitForSelector('#category-list .mce-menu-item', { visible: true });
        await page.evaluate(cat => {
            document.querySelectorAll('#category-list .mce-menu-item')
                .forEach(li => {
                    if (li.textContent.trim() === cat) li.click();
                });
        }, category);

        // 8) 본문 입력 (iframe)
        const frameHandle = await page.$('#editor-tistory_ifr');
        const frame = await frameHandle.contentFrame();
        await frame.waitForSelector('body', { visible: true });
        await frame.evaluate(content => {
            document.body.innerHTML = content;
        }, html);

        // 9) 발행 (완료 → 비공개 저장)
        await page.click('#publish-layer-btn');
        await page.waitForSelector('#publish-btn', { visible: true });
        await page.click('#publish-btn');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        console.log(`✅ [${category}] "${title}" 게시 완료`);
    }

    await browser.close();
})();
