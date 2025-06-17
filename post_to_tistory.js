require('dotenv').config();
const fs = require('fs');
const glob = require('glob');
const path = require('path');
const MarkdownIt = require('markdown-it');
// const puppeteer = require('puppeteer');
// reCaptcha 회피
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const HumanTypingPlugin = require('puppeteer-extra-plugin-human-typing');
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha');

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
    '이야기': '이야기',
    'etc': '기타등등'
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
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--disable-extensions',                 // 확장정보 체크 예방
            '--disable-infobars',                   // “Chrome is being controlled…” 배너 제거
            '--mute-audio',                         // 오디오 불필요시
            `--window-size=1920,1080`               // 화면 해상도 맞추기
        ]
    });
    const page = await browser.newPage();

    // NewDocument 스크립트로 지문 덮어쓰기
    await page.evaluateOnNewDocument(() => {
        // — 필수 은닉 로직
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.chrome = { runtime: {} };
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (params) =>
            params.name === 'notifications'
                ? Promise.resolve({ state: Notification.permission })
                : originalQuery(params);
        Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US'] });
        Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });

        // — 2번 보강 항목
        // 2-1) CPU 코어 수 & 메모리 용량 위조
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 16 });

        // 2-2) plugins & mimeTypes 리스트 흉내
        const fakePlugin = { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: '' };
        Object.defineProperty(navigator, 'plugins', {
            get: () => [fakePlugin],
        });
        Object.defineProperty(navigator, 'mimeTypes', {
            get: () => [{ type: 'application/pdf', suffixes: 'pdf', description: '', __pluginName: 'Chrome PDF Plugin' }],
        });

        // 2-3) Network Information API 위조
        if (navigator.connection) {
            Object.defineProperty(navigator.connection, 'downlink', { get: () => 10 });
            Object.defineProperty(navigator.connection, 'rtt', { get: () => 50 });
        }

        // 2-4) MediaDevices 목록 가짜값 리턴
        if (navigator.mediaDevices) {
            const origEnumerate = navigator.mediaDevices.enumerateDevices;
            navigator.mediaDevices.enumerateDevices = () =>
                Promise.resolve([{ kind: 'videoinput', label: 'FaceTime HD Camera', deviceId: 'abc123' }]);
        }
    });


    // 4) User-Agent, 화면 크기, 타임존 설정
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8' });
    await page.setViewport({ width: 1920, height: 1080 });
    // await page.emulateTimezone('Asia/Seoul');
    const client = await page.target().createCDPSession();
    await client.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Seoul' });

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
// ② 관리 페이지로 가서 로그인 필요하면 SSO 처리 (Race Condition 해결 로직 적용)
    await page.goto(`https://${BLOG_NAME}.tistory.com/manage/posts`, { waitUntil: 'networkidle2' });

    console.log('🟡 페이지 로딩 완료. 로그인 상태를 정확히 확인합니다...');

    // '글쓰기' 버튼이 보이는지 먼저 확인. 보이면 이미 로그인 된 것.
    const loggedInSelector = 'a.link_write[href="/manage/newpost"]';
    
    try {
        // 7초 동안 '글쓰기' 버튼을 기다려봄
        await page.waitForSelector(loggedInSelector, { visible: true, timeout: 7000 });
        console.log('✅ 이미 로그인된 상태입니다. (글쓰기 버튼 확인)');

    } catch (error) {
        // '글쓰기' 버튼이 7초 안에 나타나지 않으면, 로그인이 필요한 상태로 간주
        console.log('🔐 로그인이 필요한 상태로 판단. 카카오 SSO를 수행합니다.');
        
        await page.click('a.btn_login.link_kakao_id');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        // --- 이하 카카오 로그인 폼 처리 로직 (이전 답변의 개선된 버전 적용) ---
        await page.waitForSelector('input#loginId--1', { visible: true });
        await page.type('input#loginId--1', process.env.TISTORY_ID, { delay: 50 + Math.random() * 50 });
        await page.type('input#password--2', process.env.TISTORY_PASSWORD, { delay: 50 + Math.random() * 50 });

        console.log('🟡 아이디/비밀번호 입력 완료. 로그인을 시도합니다.');
        console.log('   만약 캡챠(CAPTCHA)나 2단계 인증이 나타나면 브라우저에서 직접 해결해주세요.');
        
        await page.click('button.submit');

        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 0 }); // 수동 해결 대기

        if (await page.waitForSelector('h2.tit_certify, h2.tit_g.tit_certify', { timeout: 3000 }).catch(() => null)) {
            console.log('🔒 2단계 인증 페이지 감지 – “브라우저 기억” 체크');
            await page.click('input#isRememberBrowser--5');
            console.log('🕐 카카오톡으로 인증 후 넘어올 때까지 대기…');
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 0 });
        }
        if (await page.waitForSelector('button.btn_agree', { timeout: 3000 }).catch(() => null)) {
            console.log('🔑 동의 페이지 감지 – “계속하기” 클릭');
            await page.click('button.btn_agree');
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
        }
        console.log('✅ 로그인 완료');
    }
    // // ② 관리 페이지로 가서 로그인 필요하면 SSO 처리
    // await page.goto(`https://${BLOG_NAME}.tistory.com/manage/posts`, { waitUntil: 'networkidle2' });
    // // “카카오계정으로 로그인” 버튼이 보이면, 아직 로그인 안 된 상태
    // if (await page.$('a.btn_login.link_kakao_id') !== null) {
    //     console.log('🔐 로그인 필요, 자동으로 카카오 SSO 수행');
    //     await page.click('a.btn_login.link_kakao_id');
    //     await page.waitForNavigation({ waitUntil: 'networkidle2' });

    //     // 카카오 로그인 폼
    //     await page.waitForSelector('input#loginId--1', { visible: true });
    //     await page.waitForTimeout(Math.random() * 300 + Math.random() * 2000 + Math.random() * 1000 + 200);
    //     await page.type('input#loginId--1', process.env.TISTORY_ID, { delay: 20 });
    //     await page.waitForTimeout(Math.random() * 300 + Math.random() * 2000 + Math.random() * 1000 + 200);
    //     await page.type('input#password--2', process.env.TISTORY_PASSWORD, { delay: 20 });
    //     await page.waitForTimeout(Math.random() * 300 + Math.random() * 2000 + Math.random() * 1000 + 300);
    //     try {
    //         await page.waitForSelector('iframe[src*="recaptcha"]', { timeout: 7000 });
    //     } catch {

    //     }
    //     await page.click('button.submit');
    //     await page.waitForNavigation({ waitUntil: 'networkidle2' });
    //     // 카카오 2단계 인증 페이지 검증
    //     if (await page.$('h2.tit_certify, h2.tit_g.tit_certify') !== null) {
    //         console.log('🔒 2단계 인증 페이지 감지 – “브라우저 기억” 체크');
    //         await page.click('input#isRememberBrowser--5');
    //         // 이제 카카오톡에서 “확인”을 눌러주면, 페이지가 자동 리다이렉트됩니다
    //         console.log('🕐 카카오톡으로 인증 후 넘어올 때까지 대기…');
    //         await page.waitForNavigation({ waitUntil: 'networkidle2' });
    //     }
    //     // 카카오 로그인 동의 페이지 감지
    //     if (await page.$('button.btn_agree') !== null) {
    //         console.log('🔑 동의 페이지 감지 – “계속하기” 클릭');
    //         await page.click('button.btn_agree');
    //         await page.waitForNavigation({ waitUntil: 'networkidle2' });
    //     }
    //     console.log('✅ 로그인 완료');
    // }

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
        // 정규식을 더 유연하게 변경하고, 경로 해석을 명확하게 수정
        html = html.replace(
            /<img src="([^"]+)"/g, // src 속성을 가진 모든 img 태그를 찾음
            (match, src) => {
                // src가 http/https로 시작하는 웹 이미지는 변환하지 않고 건너뜀
                if (src.startsWith('http://') || src.startsWith('https://')) {
                    return match;
                }

                // 마크다운 파일 디렉토리 기준으로 이미지 파일의 절대 경로를 계산
                const imgPath = path.resolve(mdDir, src);

                if (!fs.existsSync(imgPath)) {
                    console.warn(`⚠️  이미지를 찾을 수 없습니다. 경로: ${imgPath}`);
                    // 이미지를 찾지 못해도 원본 태그를 그대로 반환하여 링크가 깨지는 것을 방지
                    return match;
                }

                try {
                    const data = fs.readFileSync(imgPath).toString('base64');
                    const ext = path.extname(imgPath).toLowerCase().substring(1); // .png -> png

                    // Mime 타입 결정 로직 강화
                    const mimeTypes = {
                        'png': 'image/png',
                        'jpg': 'image/jpeg',
                        'jpeg': 'image/jpeg',
                        'gif': 'image/gif',
                        'svg': 'image/svg+xml',
                        'webp': 'image/webp'
                    };
                    const mimeType = mimeTypes[ext] || 'application/octet-stream';

                    // 원본 match에서 src 부분만 Base64 데이터 URI로 교체
                    const newSrc = `data:${mimeType};base64,${data}`;
                    return match.replace(src, newSrc);

                } catch (error) {
                    console.error(`❌ 이미지 파일 처리 중 오류 발생: ${imgPath}`, error);
                    return match; // 오류 발생 시 원본 태그 반환
                }
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
        await page.click('textarea#post-title-inp');
        // 전체 선택 후 백스페이스로 지우기 (mac: Meta 대신 Control 혹은 Command)
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');

        await page.type('textarea#post-title-inp', title, { delay: 50 });

        // await page.evaluate(() => {
        //     const t = document.querySelector('textarea#post-title-inp');
        //     t.value = '';
        //     // type 함수 쓰지않고, 본문처럼 바로 덮어씌우기
        //     t.value = title;

        //     t.dispatchEvent(new Event('input', { bubbles: true }));
        // }, title);
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

        // 9-1) 통합 CAPTCHA 수동 처리 로직
        // 캡챠 레이어, reCAPTCHA, dkcaptcha iframe 중 무엇이든 하나라도 나타나면 감지
        const ANY_CAPTCHA_SELECTOR = 'div.capcha_layer, iframe[src*="recaptcha"], iframe[src*="dkcaptcha"]';

        try {
            // 통합 선택자로 캡챠가 화면에 보이는지 5초간 기다림
            await page.waitForSelector(ANY_CAPTCHA_SELECTOR, { visible: true, timeout: 5000 });
            
            // 위에서 에러가 발생하지 않았다면 어떤 종류든 캡챠가 나타난 것
            console.log('🟡 CAPTCHA가 감지되었습니다. 브라우저에서 직접 해결해주세요.');
            console.log('   (캡챠를 해결하면 스크립트가 자동으로 다음 작업을 진행합니다.)');
            
            // 사용자가 캡챠를 해결하여 모든 종류의 캡챠 관련 요소가 사라질 때까지 무한정 대기
            await page.waitForFunction(
                (selector) => !document.querySelector(selector), 
                { timeout: 0 },
                ANY_CAPTCHA_SELECTOR // waitForFunction에 selector 문자열을 인자로 전달
            );
            
            console.log('✅ CAPTCHA 해결이 확인되었습니다. 글 목록으로 이동을 기다립니다.');
            // 캡챠가 사라진 후, 최종적으로 글 목록 페이지로 넘어가는 것을 기다림
            await page.waitForNavigation({ waitUntil: 'networkidle2' });

        } catch (error) {
            // waitForSelector에서 5초 타임아웃이 발생하면 catch 블록으로 진입
            // 이는 캡챠가 나타나지 않았다는 의미이므로 정상적인 흐름임
            console.log('🟢 CAPTCHA가 감지되지 않았습니다. 정상 발행으로 간주합니다.');
            // 캡챠가 없었더라도 발행 후 페이지 전환은 기다려야 함
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
        }

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
