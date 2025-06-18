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

// 인간 같은 행동 패턴을 구현하는 유틸리티 함수들
// 자연스러운 지연 시간 생성 (정규 분포에 가까운 랜덤 지연)
function humanDelay(min = 100, max = 500) {
    // 여러 개의 랜덤값을 더해서 정규분포에 가까운 값 생성 (중심극한정리 활용)
    const randomSum = Array(5).fill(0)
        .map(() => Math.random())
        .reduce((sum, val) => sum + val, 0);
    
    // 0~5 범위의 값을 min~max 범위로 변환
    return Math.floor(min + (randomSum / 5) * (max - min));
}

// 인간 같은 마우스 움직임 구현
async function humanMouseMovement(page, targetSelector) {
    const rect = await page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
    }, targetSelector);
    
    if (!rect) return false;
    
    // 현재 마우스 위치 가져오기 (기본값은 화면 중앙)
    const currentPosition = await page.evaluate(() => {
        return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    });
    
    // 목표 지점 (요소 내 랜덤한 위치)
    const targetX = rect.x + rect.width * (0.3 + Math.random() * 0.4);
    const targetY = rect.y + rect.height * (0.3 + Math.random() * 0.4);
    
    // 베지어 곡선 포인트 생성 (자연스러운 곡선 움직임)
    const points = [
        { x: currentPosition.x, y: currentPosition.y },
        { 
            x: currentPosition.x + (targetX - currentPosition.x) * (0.2 + Math.random() * 0.2),
            y: currentPosition.y + (targetY - currentPosition.y) * (0.4 + Math.random() * 0.3)
        },
        { 
            x: currentPosition.x + (targetX - currentPosition.x) * (0.7 + Math.random() * 0.2),
            y: currentPosition.y + (targetY - currentPosition.y) * (0.7 + Math.random() * 0.2)
        },
        { x: targetX, y: targetY }
    ];
    
    // 포인트 사이를 이동하는 단계 수
    const steps = 10 + Math.floor(Math.random() * 15);
    
    // 베지어 곡선을 따라 마우스 이동
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const point = bezierPoint(points, t);
        await page.mouse.move(point.x, point.y);
        await page.waitForTimeout(5 + Math.random() * 15);
    }
    
    // 클릭 전 약간의 지연
    await page.waitForTimeout(50 + Math.random() * 150);
    return true;
}

// 베지어 곡선 계산 함수
function bezierPoint(points, t) {
    if (points.length === 1) return points[0];
    
    const newPoints = [];
    for (let i = 0; i < points.length - 1; i++) {
        newPoints.push({
            x: (1 - t) * points[i].x + t * points[i + 1].x,
            y: (1 - t) * points[i].y + t * points[i + 1].y
        });
    }
    
    return bezierPoint(newPoints, t);
}

// 인간 같은 클릭 구현
async function humanClick(page, selector) {
    // 먼저 요소가 존재하는지 확인
    const elementExists = await page.$(selector) !== null;
    if (!elementExists) return false;
    
    // 요소가 보이고 클릭 가능한지 확인
    await page.waitForSelector(selector, { visible: true, timeout: 5000 }).catch(() => {});
    
    // 자연스러운 마우스 이동
    const moved = await humanMouseMovement(page, selector);
    if (!moved) return false;
    
    // 클릭 전 약간의 지연
    await page.waitForTimeout(humanDelay(50, 200));
    
    // 클릭 (가끔 더블 클릭 실수 시뮬레이션)
    if (Math.random() < 0.05) {
        await page.mouse.click(page.mouse.x, page.mouse.y);
        await page.waitForTimeout(humanDelay(30, 100));
        await page.mouse.click(page.mouse.x, page.mouse.y);
    } else {
        await page.mouse.click(page.mouse.x, page.mouse.y);
    }
    
    return true;
}

// 인간 같은 타이핑 구현
async function humanType(page, selector, text) {
    await page.waitForSelector(selector, { visible: true });
    
    // 타이핑 속도 변화 (WPM 기준)
    const avgWPM = 30 + Math.floor(Math.random() * 50); // 30-80 WPM
    const charsPerMinute = avgWPM * 5; // 평균 단어 길이를 5자로 가정
    const baseDelay = 60000 / charsPerMinute; // 분당 타자수에 따른 기본 지연시간
    
    // 가끔 오타를 내고 수정하는 시뮬레이션
    let i = 0;
    while (i < text.length) {
        // 현재 문자
        const char = text[i];
        
        // 오타 시뮬레이션 (5% 확률)
        if (Math.random() < 0.05 && i < text.length - 1) {
            // 다음 문자를 잘못 입력
            const wrongChar = String.fromCharCode(
                text.charCodeAt(i + 1) + (Math.random() > 0.5 ? 1 : -1)
            );
            await page.type(selector, wrongChar, { delay: baseDelay * (0.8 + Math.random() * 0.4) });
            
            // 잠시 멈춤
            await page.waitForTimeout(humanDelay(300, 800));
            
            // 백스페이스로 지우기
            await page.keyboard.press('Backspace');
            await page.waitForTimeout(humanDelay(200, 400));
            
            // 올바른 문자 입력
            await page.type(selector, char, { delay: baseDelay * (0.8 + Math.random() * 0.4) });
        } else {
            // 정상 타이핑
            await page.type(selector, char, { delay: baseDelay * (0.8 + Math.random() * 0.4) });
        }
        
        // 가끔 잠시 멈춤 (특히 구두점 후에)
        if ((char === '.' || char === ',' || char === '!' || char === '?') && Math.random() < 0.7) {
            await page.waitForTimeout(humanDelay(300, 1000));
        } else if (Math.random() < 0.05) {
            // 랜덤하게 잠시 멈춤
            await page.waitForTimeout(humanDelay(100, 500));
        }
        
        i++;
    }
}


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

    // NewDocument 스크립트로 지문 덮어쓰기 - 고급 기법 적용
    await page.evaluateOnNewDocument(() => {
        // — 필수 은닉 로직
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.chrome = { runtime: {} };
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (params) =>
            params.name === 'notifications'
                ? Promise.resolve({ state: Notification.permission })
                : originalQuery(params);
        
        // 언어 설정 - 약간의 랜덤성 추가
        const languages = ['ko-KR', 'ko', 'en-US'];
        if (Math.random() > 0.7) languages.push('ja');
        Object.defineProperty(navigator, 'languages', { get: () => languages });
        
        // 플랫폼 설정 - 랜덤하게 다양화
        const platforms = ['MacIntel', 'Win32', 'MacIntel', 'MacIntel', 'MacIntel'];
        const randomPlatform = platforms[Math.floor(Math.random() * platforms.length)];
        Object.defineProperty(navigator, 'platform', { get: () => randomPlatform });

        // — 보강 항목
        // 1) CPU 코어 수 & 메모리 용량 위조 - 자연스러운 랜덤값
        const cores = [4, 6, 8, 8, 12, 16][Math.floor(Math.random() * 6)];
        const memory = [8, 8, 16, 16, 32][Math.floor(Math.random() * 5)];
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => cores });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => memory });

        // 2) plugins & mimeTypes 리스트 흉내 - 더 자연스러운 구성
        const plugins = [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: '' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
            { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
        ];
        
        // 랜덤하게 일부 플러그인만 포함
        const selectedPlugins = plugins.filter(() => Math.random() > 0.3);
        
        Object.defineProperty(navigator, 'plugins', {
            get: () => Object.freeze(selectedPlugins)
        });
        
        const mimeTypes = [
            { type: 'application/pdf', suffixes: 'pdf', description: '', __pluginName: 'Chrome PDF Plugin' },
            { type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable', __pluginName: 'Native Client' },
            { type: 'application/x-pnacl', suffixes: '', description: 'Portable Native Client Executable', __pluginName: 'Native Client' }
        ];
        
        // 선택된 플러그인에 맞는 MIME 타입만 포함
        const selectedMimeTypes = mimeTypes.filter(mime => 
            selectedPlugins.some(plugin => plugin.name === mime.__pluginName)
        );
        
        Object.defineProperty(navigator, 'mimeTypes', {
            get: () => Object.freeze(selectedMimeTypes)
        });

        // 3) Network Information API 위조 - 더 자연스러운 값
        if (navigator.connection) {
            const downlinkValues = [5, 10, 15, 20, 25];
            const rttValues = [30, 50, 70, 100];
            Object.defineProperty(navigator.connection, 'downlink', { 
                get: () => downlinkValues[Math.floor(Math.random() * downlinkValues.length)] 
            });
            Object.defineProperty(navigator.connection, 'rtt', { 
                get: () => rttValues[Math.floor(Math.random() * rttValues.length)] 
            });
            
            // 추가: effectiveType 속성도 위조
            const types = ['4g', '4g', '4g', '3g'];
            Object.defineProperty(navigator.connection, 'effectiveType', {
                get: () => types[Math.floor(Math.random() * types.length)]
            });
        }

        // 4) MediaDevices 목록 가짜값 리턴 - 더 자연스러운 구성
        if (navigator.mediaDevices) {
            const origEnumerate = navigator.mediaDevices.enumerateDevices;
            navigator.mediaDevices.enumerateDevices = () => {
                const devices = [
                    { kind: 'videoinput', label: 'FaceTime HD Camera', deviceId: 'default' + Math.random().toString(36).substring(2, 7) },
                    { kind: 'audioinput', label: 'Built-in Microphone', deviceId: 'default' + Math.random().toString(36).substring(2, 7) }
                ];
                
                // 랜덤하게 추가 장치 포함
                if (Math.random() > 0.5) {
                    devices.push({ kind: 'audiooutput', label: 'Built-in Speaker', deviceId: 'default' + Math.random().toString(36).substring(2, 7) });
                }
                
                return Promise.resolve(devices);
            };
        }
        
        // 5) Canvas 지문 방지 - 미세한 노이즈 추가
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(type) {
            if (this.width === 16 && this.height === 16 || 
                this.width === 2 && this.height === 2 ||
                this.width < 100 && this.height < 100) {
                // 지문 수집에 사용되는 작은 캔버스는 약간 변형
                const canvas = document.createElement('canvas');
                canvas.width = this.width;
                canvas.height = this.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(this, 0, 0);
                
                // 미세한 픽셀 변경 (눈에 띄지 않는 수준)
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {
                    // 랜덤하게 1-2 픽셀값만 미세하게 조정
                    if (Math.random() < 0.1) {
                        data[i] = Math.max(0, Math.min(255, data[i] + (Math.random() * 2 - 1)));
                    }
                }
                ctx.putImageData(imageData, 0, 0);
                return canvas.toDataURL(type);
            }
            return originalToDataURL.apply(this, arguments);
        };
        
        // 6) WebGL 지문 방지
        const getParameterProxyHandler = {
            apply: function(target, thisArg, args) {
                const param = args[0];
                const result = target.apply(thisArg, args);
                
                // UNMASKED_VENDOR_WEBGL 또는 UNMASKED_RENDERER_WEBGL 파라미터 요청 시
                if (param === 37445 || param === 37446) {
                    // 원래 값을 반환하되, 가끔 약간 변형
                    if (Math.random() > 0.9 && typeof result === 'string') {
                        return result.replace(/\s+/g, ' ').trim();
                    }
                }
                return result;
            }
        };
        
        // WebGL 컨텍스트의 getParameter 함수를 프록시로 감싸기
        if (window.WebGLRenderingContext) {
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = new Proxy(getParameter, getParameterProxyHandler);
        }
    });


    // 4) User-Agent, 화면 크기, 타임존 설정 - 더 자연스러운 설정
    // 다양한 User-Agent 목록에서 랜덤 선택
    const userAgents = [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36'
    ];
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    await page.setUserAgent(randomUserAgent);
    
    // 언어 설정 - 약간의 변화 추가
    const languageOptions = [
        { 'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7' },
        { 'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8' },
        { 'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.7,en;q=0.6' }
    ];
    const randomLanguage = languageOptions[Math.floor(Math.random() * languageOptions.length)];
    await page.setExtraHTTPHeaders(randomLanguage);
    
    // 화면 크기 - 약간의 변화 추가
    const viewportSizes = [
        { width: 1920, height: 1080 },
        { width: 1920, height: 1080 },
        { width: 1680, height: 1050 },
        { width: 1440, height: 900 }
    ];
    const randomViewport = viewportSizes[Math.floor(Math.random() * viewportSizes.length)];
    await page.setViewport(randomViewport);
    
    // 타임존 설정
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

        // 6) 기존 제목 지우고, 제목 입력
        await page.waitForSelector('textarea#post-title-inp', { visible: true });
        
        // 인간 같은 클릭으로 제목 필드 선택
        await humanClick(page, 'textarea#post-title-inp');
        
        // 전체 선택 후 백스페이스로 지우기 (자연스러운 지연 추가)
        await page.waitForTimeout(humanDelay(100, 300));
        await page.keyboard.down('Control');
        await page.waitForTimeout(humanDelay(50, 150));
        await page.keyboard.press('A');
        await page.waitForTimeout(humanDelay(50, 150));
        await page.keyboard.up('Control');
        await page.waitForTimeout(humanDelay(100, 300));
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(humanDelay(200, 500));

        // 인간 같은 타이핑으로 제목 입력
        await humanType(page, 'textarea#post-title-inp', title);
        await page.waitForTimeout(humanDelay(300, 800));

        // 7) 카테고리 선택
        if (category) {
            // 인간 같은 클릭으로 카테고리 버튼 선택
            await humanClick(page, '#category-btn');
            await page.waitForTimeout(humanDelay(300, 800));
            
            await page.waitForSelector('#category-list .mce-menu-item', { visible: true });
            
            // 카테고리 목록에서 해당 카테고리 찾아 선택
            await page.evaluate(cat => {
                const items = Array.from(document.querySelectorAll('#category-list .mce-menu-item'));
                const targetItem = items.find(li => li.textContent.trim() === cat);
                if (targetItem) {
                    // 마우스 오버 효과 시뮬레이션
                    const mouseoverEvent = new MouseEvent('mouseover', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    targetItem.dispatchEvent(mouseoverEvent);
                    
                    // 약간의 지연 후 클릭
                    setTimeout(() => targetItem.click(), 100 + Math.random() * 200);
                }
            }, category);
            
            await page.waitForTimeout(humanDelay(400, 1000));
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
        // 인간 같은 클릭으로 발행 버튼 선택
        await humanClick(page, '#publish-layer-btn');
        await page.waitForSelector('#publish-btn', { visible: true });
        await page.waitForTimeout(humanDelay(500, 1200));
        
        // 발행 버튼 클릭 전 약간의 망설임 시뮬레이션
        if (Math.random() < 0.3) {
            // 마우스를 버튼 주변에서 약간 움직임
            const buttonRect = await page.evaluate(() => {
                const button = document.querySelector('#publish-btn');
                if (!button) return null;
                const rect = button.getBoundingClientRect();
                return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            });
            
            if (buttonRect) {
                // 버튼 주변에서 마우스 약간 움직이기
                for (let i = 0; i < 3; i++) {
                    const offsetX = (Math.random() - 0.5) * 20;
                    const offsetY = (Math.random() - 0.5) * 20;
                    await page.mouse.move(
                        buttonRect.x + buttonRect.width/2 + offsetX,
                        buttonRect.y + buttonRect.height/2 + offsetY
                    );
                    await page.waitForTimeout(humanDelay(100, 300));
                }
            }
        }
        
        // 최종 발행 버튼 클릭
        await humanClick(page, '#publish-btn');

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
