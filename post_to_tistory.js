const fs = require('fs');
const glob = require('glob');
const path = require('path');
const MarkdownIt = require('markdown-it');
const puppeteer = require('puppeteer');
// reCaptcha 회피
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const HumanTypingPlugin = require('puppeteer-extra-plugin-human-typing');

puppeteerExtra.use(StealthPlugin());
puppeteerExtra.use(HumanTypingPlugin());

const PROJECT_ROOT = path.resolve(__dirname);
const MAP_PATH = path.join(PROJECT_ROOT, 'post_map.json');
const POSTING_DIR = path.join(PROJECT_ROOT, 'posting');
const BLOG_NAME = process.env.BLOG_NAME || 'ahpicl';
// const HEADLESS = true;  // GitHub Actions 에선 무조건 headless
const HEADLESS = process.env.HEADLESS !== 'false'
const CHROME_PATH = process.env.CHROME_PATH
    || (process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : '/usr/bin/google-chrome-stable');

const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');
puppeteerExtra.use(
    RecaptchaPlugin({
        provider: { id: '2captcha', token: process.env.CAPTCHA_API_KEY },
        visualFeedback: true
    })
);

let postMap = {};
// 작성 포스팅 매핑목록 로드
if (fs.existsSync(MAP_PATH)) {
    postMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf-8'));
}

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
    const browser = await puppeteerExtra.launch({
        executablePath: CHROME_PATH,
        headless: HEADLESS ? 'new' : false,
        userDataDir: path.join(PROJECT_ROOT, 'puppeteer_profile'),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

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
        await page.waitForTimeout(Math.random() * 300 + Math.random() * 2000 + Math.random() * 1000 + 200);
        await page.type('input#loginId--1', process.env.TISTORY_ID, { delay: 20 });
        await page.waitForTimeout(Math.random() * 300 + Math.random() * 2000 + Math.random() * 1000 + 200);
        await page.type('input#password--2', process.env.TISTORY_PASSWORD, { delay: 20 });
        await page.waitForTimeout(Math.random() * 300 + Math.random() * 2000 + Math.random() * 1000 + 300);
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
    }

    // 글 관리 페이지 진입
    await page.goto(`https://${BLOG_NAME}.tistory.com/manage/posts`, { waitUntil: 'networkidle2' });

    page.on('dialog', async dialog => {
        console.log('🔔 팝업 감지 — 자동으로 취소 처리');
        try {
            await dialog.dismiss();
        } catch (e) {
            // 이미 처리됐거나 자동으로 닫혔으면 무시
        }
    });

    // 4) MD 파일 순회
    for (const absolutePath of files) {
        // 제목/카테고리/본문 준비
        const relPath = path.relative(POSTING_DIR, absolutePath);
        const folder = relPath.split(path.sep)[0];
        const category = CATEGORY_MAP[folder] || '';
        const mdDir = path.dirname(absolutePath);

        const raw = fs.readFileSync(absolutePath, 'utf-8');
        const lines = raw.split('\n');
        let title = '', found = false, bodyLines = [];
        let isNew = false;
        let postId = postMap[relPath];

        for (const line of lines) {
            if (!found && line.startsWith('#')) {
                title = line.slice(2).trim();
                found = true;
            } else {
                bodyLines.push(line);
            }
        }
        let html = md.render(bodyLines.join('\n'));
        html = html.replace(
            /<img src="([^"]+)" alt="([^"]*)" ?\/>/g,
            (_, src, alt) => {
                const imgPath = path.join(mdDir, src);
                if (!fs.existsSync(imgPath)) {
                    console.warn(`⚠️ 이미지가 없습니다: ${imgPath}`);
                    return `<img src="${src}" alt="${alt}">`;
                }
                const ext = path.extname(src).toLowerCase();
                const mine =
                    ext === '.png' ? 'image/png' :
                        ext === '.jpg' ? 'image/jpeg' :
                            ext === '.jpeg' ? 'image/jpeg' :
                                ext === '.gif' ? 'image/gif' :
                                    'application/octet-stream';
                const data = fs.readFileSync(imgPath).toString('base64');
                return `<img src="data:${mine};base64,${data}" alt="${alt}">`;
            }
        );

        // 신규 & 수정 게시글 분기처리
        if (postId) {
            console.log(`✏️ 이미 발행된 글 ID=${postId}, 수정모드 진입`);
            await page.goto(`https://${BLOG_NAME}.tistory.com/manage/post/${postId}?returnURL=/manage/posts`, { waitUntil: 'networkidle2' });
        } else {
            console.log(`🆕 신규 발행 모드 진입`);
            isNew = true;
            await page.goto(`https://${BLOG_NAME}.tistory.com/manage/post/?returnURL=/manage/posts`, { waitUntil: 'networkidle2' });
        }
        // “글쓰기” 페이지로 바로 이동

        // // 6) 기존 제목 지우고, 제목 입력
        await page.waitForSelector('textarea#post-title-inp', { visible: true });
        await page.evaluate(() => {
            const t = document.querySelector('textarea#post-title-inp');
            t.value = '';
            // type 함수 쓰지않고, 본문처럼 바로 덮어씌우기
            t.value = title;

            t.dispatchEvent(new Event('input', { bubbles: ture }));
        }, title);
        // await page.click('textarea#post-title-inp');
        // await page.waitForTimeout(Math.random() * 300 + Math.random() * 2000 + Math.random() * 1000 + 100);
        // await page.typeHuman('textarea#post-title-inp', title, { delay: 20 });
        await page.waitForTimeout(200);
        
        // 7) 카테고리 선택
        if (category) {
            await page.click('#category-btn', {});
            await page.waitForTimeout(Math.random() * 300 + Math.random() * 2000 + Math.random() * 1000 + 100);
            await page.waitForTimeout(400);
            await page.waitForSelector('#category-list .mce-menu-item', { visible: true });
            await page.evaluate(cat => {
                document.querySelectorAll('#category-list .mce-menu-item', { delay: 20 })
                    .forEach(li => {
                        if (li.textContent.trim() === cat) li.click();
                    });
            }, category);
            await page.waitForTimeout(Math.random() * 300 + Math.random() * 2000 + Math.random() * 1000 + 400);
        } else {
            console.log('🟡 카테고리 지정 없음, 기본 선택 유지')
        }

        // 8) 본문 입력 (iframe)
        const frameHandle = await page.waitForSelector('#editor-tistory_ifr', { visible: true });
        const frame = await frameHandle.contentFrame();
        // await frame.waitForSelector('body', { visible: true });

        await page.waitForFunction(() => !!window.tinymce && !!tinymce.activeEditor, { timeout: 30_000 });

        // API 로 덮어쓰기
        await page.evaluate(html => {
            tinymce.activeEditor.setContent(html);
        }, html);

        // 안정적으로 반영될 시간 잠깐 대기
        await page.waitForTimeout(Math.random() * 300 + Math.random() * 2000 + Math.random() * 1000 + 5000);

        // 9) 발행 (완료 → 저장)
        await page.click('#publish-layer-btn', { delay: 20 });
        await page.waitForSelector('#publish-btn', { visible: true });
        await page.waitForTimeout(Math.random() * 300 + Math.random() * 2000 + Math.random() * 1000 + 500);
        await page.click('#publish-btn', { delay: 20 });

        // 9-1) reCAPTCHA 가 떠 있으면 풀기
        try {
            // iframe 이 생기면 기다렸다가
            await page.waitForSelector('iframe[src*="recaptcha"]', { timeout: 3000 });
            // 떠 있으면 풀어주고
            const { solved, error } = await page.solveRecaptchas();
            if (solved.length) {
                console.log('✅ reCAPTCHA 풀었어요');
                await page.waitForSelector('#publish-btn', { visible: true });
                await page.waitForTimeout(Math.random() * 300 + Math.random() * 2000 + Math.random() * 1000 + 400);
                await page.click('#publish-btn', { delay: 20 });
            } else {
                console.warn('⚠️ reCAPTCHA 풀이 실패:', error);
            }
        } catch (e) {
            // timeout 으로 떨어지면 “아예 안 떴구나” 라고 보고 넘어갑니다
            console.log('🟢 reCAPTCHA 감지 안 됐어요, 그냥 넘어갈게요');
        }

        await page.waitForNavigation({ waitUntil: 'networkidle2' });
        await page.waitForTimeout(Math.random() * 300 + Math.random() * 2000 + Math.random() * 1000 + 100);

        console.log(`✅ [${category}] "${title}" 게시 완료`);

        // postId 가져오기
        const editHref = await page.$eval(
            'ul.list_post li:first-child a.btn_post[href*="/manage/post/"]',
            a => a.getAttribute('href')
        );

        const match = editHref.match(/\/manage\/post\/(\d+)/);
        if (match) {
            postId = Number(match[1]);
            if (isNew) {
                postMap[relPath] = postId;
                console.log(`💾 신규 매핑 저장: ${relPath} → ${postId}`);
            } else {
                console.log(`✏️ 수정 완료: ${relPath} → ${postId}`);
            }
        } else {
            console.warn('⚠️ postId를 추출하지 못했습니다.', editHref);
        }
    }
    fs.writeFileSync(MAP_PATH, JSON.stringify(postMap, null, 2), 'utf-8');
    console.log('💾 post_map.json 업데이트 완료');

    await browser.close();
})();
