require('dotenv').config();
const fs = require('fs');
const glob = require('glob');
const path = require('path');
const MarkdownIt = require('markdown-it');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const PROJECT_ROOT = path.resolve(__dirname);
const POSTING_DIR = path.join(PROJECT_ROOT, 'posting');

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

// 이미지를 GitHub raw URL로 변환
function convertToGitHubImageUrl(imagePath, filePath) {
    const repoOwner = 'ahpicl64'; // GitHub 사용자명
    const repoName = 'BLOG_POST'; // 저장소명
    
    // URL 디코딩된 경로 사용
    const decodedImagePath = decodeURIComponent(imagePath);
    
    // 상대 경로를 절대 경로로 변환
    const absoluteImagePath = path.resolve(path.dirname(filePath), decodedImagePath);
    const relativePath = path.relative(PROJECT_ROOT, absoluteImagePath);
    
    // GitHub raw URL 생성 (경로는 다시 URL 인코딩)
    const encodedPath = relativePath.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
    return `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/${encodedPath}`;
}

// 마크다운 이미지 처리 (GitHub URL로 변환)
function processImagesInMarkdown(content, filePath) {
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    
    return content.replace(imageRegex, (match, alt, src) => {
        // 이미 HTTP URL인 경우 그대로 유지
        if (src.startsWith('http')) {
            return match;
        }
        
        // URL 디코딩 처리 (%20 → 공백 등)
        const decodedSrc = decodeURIComponent(src);
        
        // 로컬 이미지 경로를 GitHub raw URL로 변환
        const imgPath = path.resolve(path.dirname(filePath), decodedSrc);
        if (fs.existsSync(imgPath)) {
            const githubUrl = convertToGitHubImageUrl(decodedSrc, filePath);
            console.log(`🖼️  이미지 변환: ${decodedSrc} → ${githubUrl}`);
            return `![${alt}](${githubUrl})`;
        }
        
        // 원본 경로로도 시도
        const originalImgPath = path.resolve(path.dirname(filePath), src);
        if (fs.existsSync(originalImgPath)) {
            const githubUrl = convertToGitHubImageUrl(src, filePath);
            console.log(`🖼️  이미지 변환: ${src} → ${githubUrl}`);
            return `![${alt}](${githubUrl})`;
        }
        
        console.warn(`⚠️  이미지 파일을 찾을 수 없습니다: ${src} (디코딩: ${decodedSrc})`);
        return match;
    });
}

// 카테고리 추출
function extractCategory(filePath) {
    const relativePath = path.relative(POSTING_DIR, filePath);
    const parts = relativePath.split(path.sep);
    const topFolder = parts[0];
    return CATEGORY_MAP[topFolder] || '기타등등';
}

// 제목 추출
function extractTitle(content) {
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('# ')) {
            return trimmed.substring(2).trim();
        }
    }
    return '제목 없음';
}

// 클립보드에 복사 (macOS) - Maccy 호환 버전
async function copyToClipboard(text) {
    try {
        // 방법 1: 임시 파일을 사용하여 큰 텍스트 처리
        const tempFile = path.join(PROJECT_ROOT, 'temp_clipboard.html');
        fs.writeFileSync(tempFile, text, 'utf-8');
        
        // pbcopy로 복사
        await execAsync(`pbcopy < "${tempFile}"`);
        
        // 임시 파일 삭제
        fs.unlinkSync(tempFile);
        
        console.log('✅ 클립보드에 복사되었습니다! (Maccy에서 확인 가능)');
        return true;
        
    } catch (error) {
        console.error('방법 1 실패:', error.message);
        
        try {
            // 방법 2: osascript 사용 (AppleScript)
            const tempFile = path.join(PROJECT_ROOT, 'temp_clipboard.html');
            fs.writeFileSync(tempFile, text, 'utf-8');
            
            await execAsync(`osascript -e 'set the clipboard to (read POSIX file "${tempFile}" as «class utf8»)'`);
            fs.unlinkSync(tempFile);
            
            console.log('✅ AppleScript로 클립보드에 복사되었습니다!');
            return true;
            
        } catch (error2) {
            console.error('방법 2도 실패:', error2.message);
            
            // 방법 3: 파일로 저장하고 안내
            const outputFile = path.join(PROJECT_ROOT, 'tistory_output.html');
            fs.writeFileSync(outputFile, text, 'utf-8');
            
            console.log('\n📄 클립보드 복사에 실패하여 파일로 저장했습니다:');
            console.log(`   ${outputFile}`);
            console.log('\n📋 다음 중 하나의 방법을 사용하세요:');
            console.log('   1. 파일을 열어서 Cmd+A → Cmd+C로 복사');
            console.log('   2. 터미널에서: cat tistory_output.html | pbcopy');
            console.log('   3. Maccy 히스토리에서 확인');
            
            return false;
        }
    }
}

// 메인 함수
async function processMarkdownFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.error(`❌ 파일을 찾을 수 없습니다: ${filePath}`);
        return;
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const title = extractTitle(content);
    const category = extractCategory(filePath);
    
    // 이미지 처리
    const processedContent = processImagesInMarkdown(content, filePath);
    
    // HTML 변환
    const htmlContent = md.render(processedContent);
    
    console.log('\n='.repeat(60));
    console.log(`📝 파일: ${path.relative(PROJECT_ROOT, filePath)}`);
    console.log(`📂 카테고리: ${category}`);
    console.log(`📌 제목: ${title}`);
    console.log('='.repeat(60));
    
    // 클립보드에 HTML 복사
    const success = await copyToClipboard(htmlContent);
    
    if (success) {
        console.log('✅ HTML 내용이 클립보드에 복사되었습니다!');
        console.log('\n📋 이제 다음 단계를 진행하세요:');
        console.log('1. 티스토리 관리자 → 글쓰기로 이동');
        console.log('2. 에디터에서 HTML 모드로 전환');
        console.log('3. Cmd+V (또는 Ctrl+V)로 붙여넣기');
        console.log(`4. 카테고리를 "${category}"로 설정`);
        console.log(`5. 제목을 "${title}"로 설정`);
        console.log('6. 발행하기');
    } else {
        console.log('❌ 클립보드 복사에 실패했습니다.');
        console.log('\n📄 HTML 내용:');
        console.log('-'.repeat(40));
        console.log(htmlContent);
        console.log('-'.repeat(40));
    }
}

// 커맨드라인 인자 처리
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('사용법: node clipboard_helper.js <파일명 또는 검색어>');
        console.log('예시:');
        console.log('  node clipboard_helper.js thymeleaf');
        console.log('  node clipboard_helper.js posting/Spring/thymeleaf.md');
        return;
    }
    
    const searchTerm = args[0];
    let targetFile;
    
    // 정확한 경로인지 확인
    const directPath = path.resolve(PROJECT_ROOT, searchTerm);
    if (fs.existsSync(directPath)) {
        targetFile = directPath;
    } else {
        // 파일명 검색
        const allFiles = glob.sync('**/*.md', { cwd: POSTING_DIR, absolute: true });
        const foundFiles = allFiles.filter(file => 
            path.basename(file).toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        if (foundFiles.length === 0) {
            console.error(`❌ "${searchTerm}"를 포함하는 파일을 찾을 수 없습니다.`);
            return;
        }
        
        if (foundFiles.length > 1) {
            console.error(`❌ "${searchTerm}"에 해당하는 파일이 여러 개 발견되었습니다:`);
            foundFiles.forEach(file => {
                console.error(`  - ${path.relative(PROJECT_ROOT, file)}`);
            });
            return;
        }
        
        targetFile = foundFiles[0];
    }
    
    await processMarkdownFile(targetFile);
}

// 실행
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { processMarkdownFile, copyToClipboard };
