// 추가 개선 기능 모음
// 이 파일의 함수들을 post_to_tistory.js와 man_post.js에 통합하여 사용하세요

// 인간 같은 스크롤 행동 구현
async function humanScroll(page, direction = 'down', distance = 'medium') {
    // 스크롤 거리 결정 (화면 높이 기준)
    let scrollDistance;
    const viewportHeight = page.viewport().height;
    
    switch (distance) {
        case 'short':
            scrollDistance = Math.floor(viewportHeight * (0.2 + Math.random() * 0.2));
            break;
        case 'medium':
            scrollDistance = Math.floor(viewportHeight * (0.4 + Math.random() * 0.3));
            break;
        case 'long':
            scrollDistance = Math.floor(viewportHeight * (0.7 + Math.random() * 0.3));
            break;
        default:
            scrollDistance = Math.floor(viewportHeight * (0.4 + Math.random() * 0.3));
    }
    
    if (direction === 'up') {
        scrollDistance = -scrollDistance;
    }
    
    // 스크롤 속도 및 단계 결정
    const steps = 10 + Math.floor(Math.random() * 15);
    const stepSize = scrollDistance / steps;
    
    // 자연스러운 가속 및 감속을 위한 이징 함수
    const easeInOutQuad = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    
    // 단계별 스크롤
    for (let i = 0; i < steps; i++) {
        const progress = i / (steps - 1);
        const easedProgress = easeInOutQuad(progress);
        const currentStep = Math.floor(stepSize * (i + 1) - stepSize * i * easedProgress);
        
        await page.evaluate(step => {
            window.scrollBy(0, step);
        }, currentStep);
        
        // 스크롤 중간에 약간의 일시 정지 (특히 긴 스크롤에서)
        if (Math.random() < 0.2 || (i === Math.floor(steps / 2) && distance === 'long')) {
            await page.waitForTimeout(humanDelay(50, 200));
        } else {
            await page.waitForTimeout(humanDelay(10, 30));
        }
    }
    
    // 스크롤 후 잠시 페이지 읽는 시간 시뮬레이션
    await page.waitForTimeout(humanDelay(300, 1500));
}

// 브라우저 확장 프로그램 시뮬레이션
async function simulateBrowserExtensions(page) {
    await page.evaluateOnNewDocument(() => {
        // 일반적인 확장 프로그램 관련 객체 및 이벤트 시뮬레이션
        window.chrome = window.chrome || {};
        window.chrome.runtime = window.chrome.runtime || {};
        
        // 확장 프로그램 통신 시뮬레이션
        const originalPostMessage = window.postMessage;
        window.postMessage = function(...args) {
            // 일부 확장 프로그램 메시지 시뮬레이션 (10% 확률)
            if (Math.random() < 0.1) {
                setTimeout(() => {
                    const extEvent = new MessageEvent('message', {
                        source: window,
                        origin: window.location.origin,
                        data: {
                            type: 'extension_communication',
                            sender: 'simulated_extension',
                            action: 'status_check'
                        }
                    });
                    window.dispatchEvent(extEvent);
                }, 500 + Math.random() * 1000);
            }
            return originalPostMessage.apply(this, args);
        };
        
        // 확장 프로그램 스토리지 시뮬레이션
        const localStorageData = {
            'ext_setting_dark_mode': Math.random() > 0.5 ? 'enabled' : 'disabled',
            'ext_last_update_check': Date.now() - Math.floor(Math.random() * 86400000),
            'ext_user_preference': JSON.stringify({
                notifications: Math.random() > 0.3,
                autoSave: Math.random() > 0.5,
                telemetry: Math.random() > 0.7
            })
        };
        
        // 일부 확장 프로그램 관련 로컬 스토리지 항목 추가
        for (const [key, value] of Object.entries(localStorageData)) {
            try {
                localStorage.setItem(key, value);
            } catch (e) {
                // 스토리지 접근 오류 무시
            }
        }
        
        // 확장 프로그램 관련 DOM 요소 시뮬레이션
        const simulateExtensionElements = () => {
            // 일부 확장 프로그램이 주입하는 숨겨진 요소 시뮬레이션
            const extDiv = document.createElement('div');
            extDiv.id = 'ext-element-' + Math.random().toString(36).substring(2, 10);
            extDiv.style.display = 'none';
            extDiv.dataset.extId = 'simulated-ext-' + Math.random().toString(36).substring(2, 7);
            document.body.appendChild(extDiv);
        };
        
        // DOM이 로드된 후 확장 요소 추가
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', simulateExtensionElements);
        } else {
            setTimeout(simulateExtensionElements, 100);
        }
    });
}

// 세션 관리 개선 - 쿠키 저장 및 로드 기능
async function saveBrowserSession(page, sessionName = 'default') {
    const path = require('path');
    const fs = require('fs');
    const PROJECT_ROOT = path.resolve(__dirname);
    
    const sessionDir = path.join(PROJECT_ROOT, 'sessions');
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }
    
    const sessionPath = path.join(sessionDir, `${sessionName}.json`);
    
    // 쿠키 및 로컬 스토리지 데이터 저장
    const cookies = await page.cookies();
    const localStorage = await page.evaluate(() => {
        const items = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            items[key] = localStorage.getItem(key);
        }
        return items;
    });
    
    const sessionData = {
        cookies,
        localStorage,
        timestamp: Date.now(),
        userAgent: await page.evaluate(() => navigator.userAgent)
    };
    
    fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2), 'utf-8');
    console.log(`💾 브라우저 세션 저장 완료: ${sessionName}`);
    
    return sessionData;
}

// 저장된 세션 로드
async function loadBrowserSession(page, sessionName = 'default') {
    const path = require('path');
    const fs = require('fs');
    const PROJECT_ROOT = path.resolve(__dirname);
    
    const sessionPath = path.join(PROJECT_ROOT, 'sessions', `${sessionName}.json`);
    
    if (!fs.existsSync(sessionPath)) {
        console.log(`⚠️ 저장된 세션을 찾을 수 없습니다: ${sessionName}`);
        return false;
    }
    
    try {
        const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
        
        // 쿠키 설정
        await page.setCookie(...sessionData.cookies);
        
        // 로컬 스토리지 설정
        if (sessionData.localStorage) {
            await page.evaluate(storageData => {
                for (const [key, value] of Object.entries(storageData)) {
                    try {
                        localStorage.setItem(key, value);
                    } catch (e) {
                        console.error('로컬 스토리지 설정 오류:', e);
                    }
                }
            }, sessionData.localStorage);
        }
        
        // 세션 나이 확인 (7일 이상이면 경고)
        const sessionAge = (Date.now() - sessionData.timestamp) / (1000 * 60 * 60 * 24);
        if (sessionAge > 7) {
            console.log(`⚠️ 주의: 세션이 ${Math.floor(sessionAge)}일 전에 저장되었습니다. 만료되었을 수 있습니다.`);
        }
        
        console.log(`✅ 브라우저 세션 로드 완료: ${sessionName}`);
        return true;
    } catch (error) {
        console.error(`❌ 세션 로드 중 오류 발생: ${error.message}`);
        return false;
    }
}

// 시간 패턴 다양화 - 실행 시간 랜덤화
function getRandomExecutionDelay() {
    // 시간대별 가중치 설정 (24시간 기준)
    const now = new Date();
    const hour = now.getHours();
    
    // 일반적인 활동 시간대에 더 높은 가중치 부여
    let weight;
    if (hour >= 9 && hour < 18) {
        // 업무 시간 (9AM-6PM): 높은 가중치
        weight = 0.8;
    } else if ((hour >= 7 && hour < 9) || (hour >= 18 && hour < 23)) {
        // 아침 및 저녁 시간: 중간 가중치
        weight = 0.5;
    } else {
        // 심야 시간: 낮은 가중치
        weight = 0.2;
    }
    
    // 요일 가중치 (주말은 낮은 가중치)
    const day = now.getDay(); // 0: 일요일, 6: 토요일
    if (day === 0 || day === 6) {
        weight *= 0.7; // 주말은 70% 가중치
    }
    
    // 최종 지연 시간 계산 (1분~30분)
    const baseDelay = 60000; // 1분
    const maxAdditionalDelay = 29 * 60000; // 29분
    
    // 가중치에 따라 지연 시간 조정
    const randomFactor = Math.random();
    const adjustedRandomFactor = randomFactor * weight;
    
    return baseDelay + Math.floor(adjustedRandomFactor * maxAdditionalDelay);
}

// 사용 예시:
// 1. 스크립트 시작 시 랜덤 지연 적용
// const executionDelay = getRandomExecutionDelay();
// console.log(`🕒 자연스러운 실행 패턴을 위해 ${Math.floor(executionDelay/60000)}분 ${Math.floor((executionDelay%60000)/1000)}초 대기 중...`);
// await new Promise(resolve => setTimeout(resolve, executionDelay));

// 2. 브라우저 시작 시 확장 프로그램 시뮬레이션 적용
// await simulateBrowserExtensions(page);

// 3. 페이지 탐색 중 자연스러운 스크롤 적용
// await humanScroll(page, 'down', 'medium');

// 4. 세션 관리 사용
// 로그인 성공 후: await saveBrowserSession(page, 'tistory_session');
// 스크립트 시작 시: const sessionLoaded = await loadBrowserSession(page, 'tistory_session');
