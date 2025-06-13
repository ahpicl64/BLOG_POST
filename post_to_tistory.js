const fs = require('fs');
const glob = require('glob');
const path = require('path');
const MarkdownIt = require('markdown-it');
const puppeteer = require('puppeteer');

const PROJECT_ROOT = path.resolve(__dirname);
const POSTING_DIR = path.join(PROJECT_ROOT, 'posting');
const BLOG_NAME = process.env.BLOG_NAME || 'ahpicl';
// const HEADLESS = true;  // GitHub Actions 에선 무조건 headless
const HEADLESS = process.env.HEADLESS !== 'false'
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
    '학습': '학습',
    '이야기': '이야기'
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
        headless: HEADLESS ? 'new' : false,
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

    // ② 관리 페이지로 가서 로그인 필요하면 SSO 처리
    await page.goto(`https://${BLOG_NAME}.tistory.com/manage/posts`, { waitUntil: 'networkidle2' });
    // “카카오계정으로 로그인” 버튼이 보이면, 아직 로그인 안 된 상태
    if (await page.$('a.btn_login.link_kakao_id') !== null) {
        console.log('🔐 로그인 필요, 자동으로 카카오 SSO 수행');
        await page.click('a.btn_login.link_kakao_id');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        // 카카오 로그인 폼
        await page.waitForSelector('input#loginId--1', { visible: true });
        await page.type('input#loginId--1', process.env.TISTORY_ID, { delay: 20 });
        await page.type('input#password--2', process.env.TISTORY_PASSWORD, { delay: 20 });
        await page.click('button.submit');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        // 카카오 2단계 인증 페이지 검증
        if (await page.$('h2.tit_certify, h2.tit_g.tit_certify') !== null) {
            console.log('🔒 2단계 인증 페이지 감지 – “브라우저 기억” 체크');
            await page.click('input#isRememberBrowser--5');
            // 이제 카카오톡에서 “확인”을 눌러주면, 페이지가 자동 리다이렉트됩니다
            console.log('🕐 카카오톡으로 인증 후 넘어올 때까지 대기…');
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
        }
        // 카카오 로그인 동의 페이지 감지
        if (await page.$('button.btn_agree') !== null) {
            console.log('🔑 동의 페이지 감지 – “계속하기” 클릭');
            await page.click('button.btn_agree');
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
        }
        console.log('✅ 로그인 완료');
        // console.log('✅ 로그인 성공, 세션 쿠키 새로 저장');

        // 쿠키 저장
        // const newCookies = await page.cookies();
        // fs.writeFileSync(COOKIE_PATH, JSON.stringify(newCookies, null, 2));
    }

    // 글 관리 페이지 진입
    await page.goto(`https://${BLOG_NAME}.tistory.com/manage/posts`, { waitUntil: 'networkidle2' });

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
            if (!found && line.startsWith('#')) {
                title = line.slice(2).trim();
                found = true;
            } else {
                bodyLines.push(line);
            }
        }
        const html = md.render(bodyLines.join('\n'));

        // 5) 글 관리 페이지
        page.once('dialog', async dialog => {
            console.log('🔔 임시 저장 확인 팝업 감지 — 취소 처리');
            await dialog.dismiss();
        });
        // “글쓰기” 버튼 클릭
        await page.goto(`https://${BLOG_NAME}.tistory.com/manage/post/?returnURL=/manage/posts`, { waitUntil: 'networkidle2' });
        // await page.waitForSelector('a.link_write, .btn_log_info', { visible: true });
        // await page.click('a.link_write, .btn_log_info');
        // await page.waitForNavigation({ waitUntil: 'networkidle2' });
        // await page.goto(`https://${BLOG_NAME}.tistory.com/manage/post/?returnURL=/manage/posts`, { waitUntil: 'networkidle2' });
        // if 임시 저장 alert

        // 6) 제목 입력
        await page.waitForSelector('textarea#post-title-inp', { visible: true });
        await page.click('textarea#post-title-inp');
        await page.type('textarea#post-title-inp', title, { delay: 20 });
        await page.waitForTimeout(200);

        // 7) 카테고리 선택
        if (category) {
            await page.click('#category-btn', { delay: 30 });
            await page.waitForTimeout(400);
            await page.waitForSelector('#category-list .mce-menu-item', { visible: true });
            await page.evaluate(cat => {
                document.querySelectorAll('#category-list .mce-menu-item', { delay: 20 })
                    .forEach(li => {
                        if (li.textContent.trim() === cat) li.click();
                    });
            }, category);
            await page.waitForTimeout(400);
        } else {
            console.log('🟡 카테고리 지정 없음, 기본 선택 유지')
        }

        // 8) 본문 입력 (iframe)
        const frameHandle = await page.$('#editor-tistory_ifr', { delay: 20 });
        const frame = await frameHandle.contentFrame({ delay: 20 });
        await frame.waitForSelector('body', { visible: true });
        await frame.evaluate(content => {
            document.body.innerHTML = content;
        }, html);
        await page.waitForTimeout(1000);

        // 9) 발행 (완료 → 비공개 저장)
        await page.click('#publish-layer-btn', { delay: 20 });
        await page.waitForSelector('#publish-btn', { visible: true });
        await page.waitForTimeout(400);
        await page.click('#publish-btn', { delay: 20 });
        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        await page.waitForTimeout(400);

        console.log(`✅ [${category}] "${title}" 게시 완료`);
    }

    await browser.close();
})();
