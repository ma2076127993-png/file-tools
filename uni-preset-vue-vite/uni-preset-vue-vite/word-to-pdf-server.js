const express = require('express');
const multer = require('multer');
const { execFile, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const app = express();
// 优化multer配置：使用磁盘存储但加快处理速度
const upload = multer({ 
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    // 快速验证文件类型
    cb(null, true);
  }
});

const audioUpload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB for common music/audio files
  fileFilter: (req, file, cb) => cb(null, true),
});

const AUDIO_FORMATS = new Set(['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma', 'aiff']);
const AUDIO_MIME_TYPES = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wma: 'audio/x-ms-wma',
  aiff: 'audio/aiff',
};
const OFFICE_FORMATS = new Set(['pdf', 'doc', 'docx', 'rtf', 'odt', 'html', 'txt', 'ppt', 'pptx', 'xls', 'xlsx', 'csv']);
const OFFICE_MIME_TYPES = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  html: 'text/html; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
};

// 简单 CORS，方便本地 H5 调用
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// 自动检测LibreOffice soffice路径
function detectSofficePath() {
  const possiblePaths = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    'D:\\Program Files\\LibreOffice\\program\\soffice.exe',
    '/usr/bin/libreoffice',
    '/usr/local/bin/libreoffice',
    '/usr/bin/soffice',
    '/usr/local/bin/soffice',
    'libreoffice',
    'soffice',
  ];

  for (const p of possiblePaths) {
    try {
      execFileSync(p, ['--version'], { stdio: 'ignore', timeout: 5000 });
      console.log(`[INIT] Found LibreOffice at: ${p}`);
      return p;
    } catch (e) {
      // 继续尝试下一个路径
    }
  }

  console.warn('[WARN] LibreOffice not found. Word/PDF conversions that require LibreOffice will be unavailable.');
  return null;
}

const sofficePath = detectSofficePath();

function detectFfmpegPath() {
  const packageCandidates = [];
  try {
    packageCandidates.push(require('ffmpeg-static'));
  } catch (e) {
    // ffmpeg-static is optional; system ffmpeg may still be available.
  }

  const possiblePaths = [
    ...packageCandidates,
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
    'ffmpeg',
  ].filter(Boolean);

  for (const p of possiblePaths) {
    try {
      execFileSync(p, ['-version'], { stdio: 'ignore', timeout: 5000 });
      console.log(`[INIT] Found FFmpeg at: ${p}`);
      return p;
    } catch (e) {
      // Try the next candidate.
    }
  }

  console.warn('[WARN] FFmpeg not found. Audio conversion will be unavailable.');
  return null;
}

const ffmpegPath = detectFfmpegPath();

// Python转换脚本路径（用于PDF转Word/PPT的快速转换）
const pythonScriptPath = path.join(__dirname, 'pdf_converter.py');
const pythonPath = 'python3.8'; // 或 'python3'，根据系统配置

// 检查Python是否可用（用于快速转换）
function checkPythonAvailable() {
  try {
    const { execSync } = require('child_process');
    execSync(`${pythonPath} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// 检查pdf2docx库是否安装
function checkPdf2Docx() {
  try {
    const { execSync } = require('child_process');
    execSync(`${pythonPath} -c "import pdf2docx"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// 检查pdf2pptx库是否安装
function checkPdf2Pptx() {
  try {
    const { execSync } = require('child_process');
    execSync(`${pythonPath} -c "import pdf2pptx"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// 检查PDF转Excel所需Python库是否安装
function checkPdfToExcel() {
  try {
    const { execSync } = require('child_process');
    execSync(`${pythonPath} -c "import fitz, xlsxwriter"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const pythonAvailable = checkPythonAvailable();
const pdf2docxAvailable = pythonAvailable && checkPdf2Docx();
const pdf2pptxAvailable = pythonAvailable && checkPdf2Pptx();
const pdfToExcelAvailable = pythonAvailable && checkPdfToExcel();

// 详细的系统检查日志
console.log('\n========== 系统初始化检查 ==========');
console.log(`[✓] Express 服务器: 就绪`);
console.log(`[${pythonAvailable ? '✓' : '✗'}] Python 环境: ${pythonAvailable ? '可用' : '不可用'}`);
console.log(`[${sofficePath ? '✓' : '✗'}] LibreOffice: ${sofficePath ? '已检测到' : '未找到'}`);
console.log(`[${ffmpegPath ? '✓' : '✗'}] FFmpeg: ${ffmpegPath ? '已检测到' : '未找到'}`);
if (pythonAvailable) {
  console.log(`[${pdf2docxAvailable ? '✓' : '✗'}] pdf2docx 库: ${pdf2docxAvailable ? '已安装（Word转换加速）' : '未安装'}`);
  console.log(`[${pdf2pptxAvailable ? '✓' : '✗'}] pdf2pptx 库: ${pdf2pptxAvailable ? '已安装（PPT转换加速）' : '未安装'}`);
  console.log(`[${pdfToExcelAvailable ? '✓' : '✗'}] fitz/xlsxwriter 库: ${pdfToExcelAvailable ? '已安装（Excel转换）' : '未安装'}`);
  if (!pdf2docxAvailable) {
    console.log('  💡 安装 pdf2docx: pip install pdf2docx');
  }
  if (!pdf2pptxAvailable) {
    console.log('  💡 安装 pdf2pptx: pip install pdf2pptx');
  }
}
console.log('=====================================\n');

// 详细可用的功能列表
const features = {
  wordToPdf: !!sofficePath, // Word->PDF 需要 LibreOffice
  imageToPdf: true, // 图片->PDF使用pdfkit，总是可用
  pdfToWord: pdf2docxAvailable || !!sofficePath, // Python或LibreOffice
  pdfToPpt: pdf2pptxAvailable || !!sofficePath, // Python或LibreOffice
  pdfToExcel: pdfToExcelAvailable || !!sofficePath,
  audioConvert: !!ffmpegPath,
};

console.log('可用的转换功能:');
Object.entries(features).forEach(([key, enabled]) => {
  const names = {
    wordToPdf: 'Word → PDF',
    imageToPdf: '图片 → PDF',
    pdfToWord: 'PDF → Word',
    pdfToPpt: 'PDF → PPT',
    pdfToExcel: 'PDF → Excel',
    audioConvert: '音频格式转换',
  };
  console.log(`  [${enabled ? '✓' : '✗'}] ${names[key]}`);
});
console.log('');

// 使用Python进行PDF转换的辅助函数
function convertWithPython(convertType, inputPath, outputPath, timeout, callback) {
  const { execFile } = require('child_process');
  
  execFile(
    pythonPath,
    [pythonScriptPath, convertType, inputPath, outputPath],
    { timeout, maxBuffer: 20 * 1024 * 1024 },
    (err, stdout, stderr) => {
      if (err) {
        callback(err, null);
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        if (result.success) {
          callback(null, result.output_path);
        } else {
          callback(new Error(result.error || '转换失败'), null);
        }
      } catch (e) {
        callback(new Error(`解析Python输出失败: ${e.message}`), null);
      }
    }
  );
}

// 系统诊断接口 - 检查服务器能力
app.get('/api/system/status', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    capabilities: {
      wordToPdf: features.wordToPdf,
      imageToPdf: features.imageToPdf,
      pdfToWord: features.pdfToWord,
      pdfToPpt: features.pdfToPpt,
      pdfToExcel: features.pdfToExcel,
      audioConvert: features.audioConvert,
    },
    details: {
      pythonAvailable,
      pdf2docxAvailable,
      pdf2pptxAvailable,
      pdfToExcelAvailable,
      libreOfficeAvailable: !!sofficePath,
      ffmpegAvailable: !!ffmpegPath,
      supportedAudioFormats: Array.from(AUDIO_FORMATS),
    },
  });
});

// Word -> PDF 接口
app.post('/api/convert/word-to-pdf', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: '请上传一个 Word 文件' });
  }
  if (!sofficePath) {
    safeUnlink(req.file.path);
    return res.status(503).json({ message: 'Word 转 PDF 需要服务器安装 LibreOffice' });
  }

  const inputPath = req.file.path; // 临时 Word 文件
  const outputDir = path.dirname(inputPath);
  const originalExt = path.extname(req.file.originalname || '').toLowerCase();
  const inputExt = originalExt === '.doc' || originalExt === '.docx' ? originalExt : '.docx';
  const actualInputPath = inputPath.toLowerCase().endsWith(inputExt) ? inputPath : inputPath + inputExt;

  console.log('[convert] input:', inputPath);

  try {
    if (actualInputPath !== inputPath) {
      fs.copyFileSync(inputPath, actualInputPath);
    }
  } catch (e) {
    console.error('[convert] failed to prepare input file:', e);
    safeUnlink(inputPath);
    return res.status(500).json({ message: '转换失败，无法准备临时 Word 文件' });
  }

  // 调用 LibreOffice (soffice) 进行转换
  execFile(
    sofficePath,
    ['--headless', '--convert-to', 'pdf', actualInputPath, '--outdir', outputDir],
    (err) => {
      if (err) {
        console.error('[convert] soffice error:', err);
        safeUnlink(actualInputPath);
        safeUnlink(inputPath);
        return res.status(500).json({ message: '转换失败，请检查 LibreOffice 是否安装正确' });
      }

      const pdfPath = path.join(
        outputDir,
        path.basename(actualInputPath, path.extname(actualInputPath)) + '.pdf'
      );
      const downloadName =
        (req.file.originalname || 'document').replace(/\.(docx?|DOCX?)$/, '') + '.pdf';

      if (!fs.existsSync(pdfPath)) {
        console.error('[convert] pdf not found:', pdfPath);
        safeUnlink(actualInputPath);
        safeUnlink(inputPath);
        return res.status(500).json({ message: '转换失败，未找到生成的 PDF 文件' });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(downloadName)}"`
      );

      const stream = fs.createReadStream(pdfPath);
      stream.pipe(res);
      stream.on('close', () => {
        safeUnlink(pdfPath);
        safeUnlink(actualInputPath);
        safeUnlink(inputPath);
      });
      stream.on('error', (e) => {
        console.error('[convert] stream error:', e);
        safeUnlink(pdfPath);
        safeUnlink(actualInputPath);
        safeUnlink(inputPath);
      });
    }
  );
});

function safeUnlink(p) {
  if (!p) return;
  // 延迟删除文件，确保文件流完全关闭
  setTimeout(() => {
    fs.unlink(p, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.warn(`[WARN] Failed to delete temp file ${p}:`, err.message);
      } else if (!err) {
        console.log(`[CLEANUP] Deleted temp file: ${p}`);
      }
    });
  }, 1000); // 延迟1秒删除
}

function getSafeBaseName(originalName, fallback = 'document') {
  const parsed = path.parse(originalName || fallback);
  return (parsed.name || fallback).replace(/[\\/:*?"<>|]/g, '_');
}

function findConvertedFile(outputDir, baseName, targetFormat) {
  const exactPath = path.join(outputDir, `${baseName}.${targetFormat}`);
  if (fs.existsSync(exactPath)) return exactPath;

  const lowerExt = `.${targetFormat.toLowerCase()}`;
  try {
    const candidates = fs.readdirSync(outputDir)
      .filter((name) => name.toLowerCase().endsWith(lowerExt))
      .map((name) => path.join(outputDir, name))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return candidates[0] || null;
  } catch (e) {
    return null;
  }
}

app.post('/api/convert/office', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: '请上传一个文档文件' });
  }
  if (!sofficePath) {
    safeUnlink(req.file.path);
    return res.status(503).json({ message: '文档转换需要服务器安装 LibreOffice' });
  }

  const targetFormat = String(req.body.format || '').toLowerCase();
  if (!OFFICE_FORMATS.has(targetFormat)) {
    safeUnlink(req.file.path);
    return res.status(400).json({ message: '暂不支持这个目标格式' });
  }

  const sourceExt = path.extname(req.file.originalname || '').toLowerCase().replace('.', '');
  if (!OFFICE_FORMATS.has(sourceExt)) {
    safeUnlink(req.file.path);
    return res.status(400).json({ message: '暂不支持这个源文件格式' });
  }
  if (sourceExt === targetFormat) {
    safeUnlink(req.file.path);
    return res.status(400).json({ message: '源格式和目标格式相同，请选择其他格式' });
  }

  const inputPath = req.file.path;
  const outputDir = path.dirname(inputPath);
  const baseName = getSafeBaseName(req.file.originalname, 'document');
  const actualInputPath = path.join(outputDir, `${path.basename(inputPath)}.${sourceExt}`);

  try {
    fs.copyFileSync(inputPath, actualInputPath);
  } catch (e) {
    console.error('[office] failed to prepare input file:', e);
    safeUnlink(inputPath);
    return res.status(500).json({ message: '转换失败，无法准备临时文件' });
  }

  console.log('[office] converting:', req.file.originalname, 'to', targetFormat);
  const convertArgs = ['--headless'];
  if (sourceExt === 'csv') {
    convertArgs.push('--infilter=CSV:44,34,76,1');
  }
  convertArgs.push('--convert-to', targetFormat, actualInputPath, '--outdir', outputDir);

  execFile(
    sofficePath,
    convertArgs,
    { timeout: 240000 },
    (err) => {
      if (err) {
        console.error('[office] soffice error:', err);
        safeUnlink(actualInputPath);
        safeUnlink(inputPath);
        return res.status(500).json({ message: '转换失败，请检查文件内容是否有效' });
      }

      const convertedPath = findConvertedFile(
        outputDir,
        path.basename(actualInputPath, path.extname(actualInputPath)),
        targetFormat
      );
      if (!convertedPath || !fs.existsSync(convertedPath)) {
        console.error('[office] output not found:', targetFormat);
        safeUnlink(actualInputPath);
        safeUnlink(inputPath);
        return res.status(500).json({ message: '转换失败，未找到生成文件' });
      }

      const downloadName = `${baseName}.${targetFormat}`;
      res.setHeader('Content-Type', OFFICE_MIME_TYPES[targetFormat] || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);

      const stream = fs.createReadStream(convertedPath);
      stream.pipe(res);
      stream.on('close', () => {
        safeUnlink(convertedPath);
        safeUnlink(actualInputPath);
        safeUnlink(inputPath);
      });
      stream.on('error', (e) => {
        console.error('[office] stream error:', e);
        safeUnlink(convertedPath);
        safeUnlink(actualInputPath);
        safeUnlink(inputPath);
      });
    }
  );
});

// 清理过期的上传文件（定期清理uploads目录中的旧文件）
function cleanupOldUploads() {
  const uploadsDir = path.join(__dirname, 'uploads');
  const maxAgeMs = 24 * 60 * 60 * 1000; // 24小时
  
  try {
    const files = fs.readdirSync(uploadsDir);
    const now = Date.now();
    
    files.forEach((file) => {
      const filePath = path.join(uploadsDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          console.log(`[CLEANUP] Removed old file: ${filePath}`);
        }
      } catch (e) {
        // 忽略单个文件的错误
      }
    });
  } catch (e) {
    console.error('[CLEANUP] Error cleaning uploads directory:', e.message);
  }
}

// 每小时清理一次过期文件
setInterval(cleanupOldUploads, 60 * 60 * 1000);

// 额外导出图片转 PDF 接口所需的工具（图片 -> 合并成一个 PDF，自动统一页面尺寸）
app.post('/api/convert/image-to-pdf', upload.array('images', 20), (req, res) => {
  const files = req.files || [];
  if (!files.length) {
    return res.status(400).json({ message: '请至少上传一张图片' });
  }

  const outputDir = path.dirname(files[0].path);
  const pdfPath = path.join(outputDir, `images_${Date.now()}.pdf`);

  console.log('[image-pdf] images:', files.map((f) => f.path));

  const doc = new PDFDocument({ autoFirstPage: false });
  const outStream = fs.createWriteStream(pdfPath);
  let settled = false;
  let pageCount = 0;

  const fail = (status, message, error) => {
    if (settled) return;
    settled = true;
    if (error) {
      console.error('[image-pdf] failed:', error);
    }
    safeUnlink(pdfPath);
    files.forEach((f) => safeUnlink(f.path));
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  };

  doc.pipe(outStream);
  doc.on('error', (e) => fail(400, '生成 PDF 失败，请检查上传的图片是否有效', e));

  try {
    // 先用第一张图片确定统一页面大小
    const firstImgBuf = fs.readFileSync(files[0].path);
    const firstImg = doc.openImage(firstImgBuf);
    const pageWidth = Math.max(firstImg.width, 100);
    const pageHeight = Math.max(firstImg.height, 100);
    const margin = 20; // 统一留白边距

    files.forEach((file) => {
      try {
        const imgBuf = fs.readFileSync(file.path);
        const img = doc.openImage(imgBuf);

        // 计算缩放比例，使所有图片都适配到同一页面大小，保持宽高比
        const maxW = pageWidth - margin * 2;
        const maxH = pageHeight - margin * 2;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        const drawW = img.width * scale;
        const drawH = img.height * scale;

        const x = (pageWidth - drawW) / 2;
        const y = (pageHeight - drawH) / 2;

        doc.addPage({ size: [pageWidth, pageHeight] });
        doc.image(img, x, y, { width: drawW, height: drawH });
        pageCount++;
      } catch (e) {
        console.error('[image-pdf] open image error:', e);
      }
    });
  } catch (e) {
    console.error('[image-pdf] init first image error:', e);
    return fail(400, '生成 PDF 失败，请检查上传的图片是否有效', e);
  }

  if (pageCount === 0) {
    return fail(400, '生成 PDF 失败，请至少上传一张有效图片');
  }

  doc.end();

  outStream.on('finish', () => {
    if (settled) return;
    settled = true;
    const downloadName = 'images.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(downloadName)}"`
    );

    const stream = fs.createReadStream(pdfPath);
    stream.pipe(res);
    stream.on('close', () => {
      safeUnlink(pdfPath);
      files.forEach((f) => safeUnlink(f.path));
    });
    stream.on('error', (e) => {
      console.error('[image-pdf] stream error:', e);
      safeUnlink(pdfPath);
      files.forEach((f) => safeUnlink(f.path));
    });
  });

  outStream.on('error', (e) => {
    fail(500, '生成 PDF 失败', e);
  });
});

// PDF -> Word (DOCX) 接口（优化版：添加轮询等待和更宽松的文件查找）
app.post('/api/convert/pdf-to-word', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: '请上传一个 PDF 文件' });
  }

  const inputPath = req.file.path;
  const outputDir = path.dirname(inputPath);
  const baseName = (req.file.originalname || 'document').replace(/\.pdf$/i, '') || 'document';

  console.log('[pdf->word] file received, size:', req.file.size, 'starting conversion...');
  console.log('[pdf->word] inputPath:', inputPath);
  console.log('[pdf->word] outputDir:', outputDir);
  console.log('[pdf->word] baseName:', baseName);

  // 预期的输出文件路径
  const expectedPath = path.join(outputDir, `${baseName}.docx`);
  // LibreOffice 可能会生成不同名称的文件（如果输入文件没有扩展名）
  const inputFileName = path.basename(inputPath);
  const altPath = path.join(outputDir, `${inputFileName}.docx`);
  const altPath2 = path.join(outputDir, `document.docx`);
  
  console.log('[pdf->word] expectedPath:', expectedPath);
  console.log('[pdf->word] altPath:', altPath);
  console.log('[pdf->word] altPath2:', altPath2);

  // 设置超时时间（如果使用Python则120秒，LibreOffice则240秒）
  const timeout = pdf2docxAvailable ? 120000 : 240000;
  let fileFound = false;
  let processCompleted = false;
  let processError = null;

  // 优先使用Python转换器（更快）
  if (pdf2docxAvailable) {
    console.log('[pdf->word] using Python converter (faster)');
    convertWithPython('word', inputPath, expectedPath, timeout, (err, outputPath) => {
      processCompleted = true;
      
      if (err) {
        console.error('[pdf->word] Python converter error:', err);
        processError = err;
        // 如果Python转换失败，回退到LibreOffice
        console.log('[pdf->word] falling back to LibreOffice');
        useLibreOfficeConverter();
        return;
      }
      
      // 检查outputPath和expectedPath
      const pathsToCheck = [outputPath, expectedPath].filter(p => p);
      let foundPath = null;
      
      for (const checkPath of pathsToCheck) {
        if (checkPath && fs.existsSync(checkPath)) {
          const stat = fs.statSync(checkPath);
          if (stat.size > 0) {
            foundPath = checkPath;
            break;
          }
        }
      }
      
      if (foundPath) {
        console.log('[pdf->word] Python conversion successful:', foundPath);
        fileFound = true;
        sendFile(foundPath);
      } else {
        console.error('[pdf->word] Python conversion completed but file not found at:', pathsToCheck);
        processError = new Error('转换完成但文件不存在');
        // 不立即回退，让checkFile继续查找
      }
    });
  } else {
    useLibreOfficeConverter();
  }

  function useLibreOfficeConverter() {
    if (!sofficePath) {
      console.error('[pdf->word] LibreOffice not available for fallback');
      processCompleted = true;
      processError = new Error('LibreOffice not available');
      return;
    }
    console.log('[pdf->word] starting LibreOffice conversion...');
    console.log('[pdf->word] sofficePath:', sofficePath);
    console.log('[pdf->word] inputPath:', inputPath);
    console.log('[pdf->word] outputDir:', outputDir);
    
    // 确保输入文件有.pdf扩展名（LibreOffice需要扩展名来识别文件类型）
    let actualInputPath = inputPath;
    let tempPdfPath = null;
    if (!inputPath.toLowerCase().endsWith('.pdf')) {
      tempPdfPath = inputPath + '.pdf';
      try {
        fs.copyFileSync(inputPath, tempPdfPath);
        actualInputPath = tempPdfPath;
        console.log('[pdf->word] copied input file to:', actualInputPath);
      } catch (e) {
        console.error('[pdf->word] failed to copy input file:', e);
        // 继续使用原路径
      }
    }
    
    // 调用 LibreOffice 进行转换（优化参数以加快速度）
    const child = execFile(
      sofficePath,
      [
        '--headless',
        '--invisible',
        '--nodefault',
        '--nolockcheck',
        '--norestore',
        '--nofirststartwizard',
        '--nologo',
        '--convert-to',
        'docx',
        actualInputPath,
        '--outdir',
        outputDir,
      ],
      { 
        timeout, 
        maxBuffer: 20 * 1024 * 1024,
        env: { ...process.env, SAL_DISABLE_OPENCL: '1' } // 禁用OpenCL加速，避免兼容性问题
      },
      (err, stdout, stderr) => {
        processCompleted = true;
        
        if (err) {
          console.error('[pdf->word] soffice error:', err);
          console.error('[pdf->word] stderr:', stderr);
          console.error('[pdf->word] stdout:', stdout);
          processError = err;
          // 不立即返回错误，继续检查文件（可能文件已经生成了）
          return;
        }

        console.log('[pdf->word] soffice completed, stdout:', stdout);
        if (stderr) {
          console.log('[pdf->word] soffice stderr:', stderr);
        }
      }
    );
    
    // 监听进程退出
    child.on('exit', (code, signal) => {
      console.log('[pdf->word] LibreOffice process exited, code:', code, 'signal:', signal);
      // 清理临时PDF文件
      if (tempPdfPath) {
        setTimeout(() => {
          try {
            if (fs.existsSync(tempPdfPath)) {
              fs.unlinkSync(tempPdfPath);
              console.log('[pdf->word] cleaned up temp PDF file:', tempPdfPath);
            }
          } catch (e) {
            console.error('[pdf->word] failed to cleanup temp PDF:', e);
          }
        }, 5000);
      }
    });
    
    child.on('error', (err) => {
      console.error('[pdf->word] LibreOffice process error:', err);
      processCompleted = true;
      processError = err;
    });
  }

  // 轮询检查文件是否生成（每500ms检查一次，最多等待180秒）
  const checkInterval = 500;
  const maxWaitTime = 180000; // 增加到180秒
  const startTime = Date.now();
  let checkCount = 0;
  const maxChecks = Math.floor(maxWaitTime / checkInterval);

  const checkFile = () => {
    if (fileFound || res.headersSent) {
      return;
    }

    checkCount++;
    const elapsed = Date.now() - startTime;
    
    // 每20次检查输出一次日志
    if (checkCount % 20 === 0) {
      console.log(`[pdf->word] checking... count: ${checkCount}, elapsed: ${Math.round(elapsed/1000)}s, processCompleted: ${processCompleted}`);
    }

    // 优先检查预期路径（放宽条件：如果文件存在且大小>0，立即发送）
    if (fs.existsSync(expectedPath)) {
      try {
        const stat = fs.statSync(expectedPath);
        if (stat.size > 0) {
          // 放宽条件：如果文件存在且大小>0，立即发送（不等待进程完成）
          const fileAge = Date.now() - stat.mtimeMs;
          // 如果文件在最近2分钟内被修改，或者进程已完成，或者检查次数>10，立即发送
          if (fileAge < 120000 || processCompleted || checkCount > 10) {
            console.log('[pdf->word] found file at expectedPath:', expectedPath, 'size:', stat.size, 'age:', fileAge, 'ms');
            fileFound = true;
            sendFile(expectedPath);
            return;
          }
        }
      } catch (e) {
        console.error('[pdf->word] stat error:', e);
      }
    }

    // 检查备用路径
    const altPaths = [altPath, altPath2];
    for (const alt of altPaths) {
      if (fs.existsSync(alt)) {
        try {
          const stat = fs.statSync(alt);
          if (stat.size > 0) {
            const fileAge = Date.now() - stat.mtimeMs;
            if (processCompleted || fileAge < 60000 || (checkCount > 20 && fileAge < 120000)) {
              console.log('[pdf->word] found file at altPath:', alt, 'size:', stat.size);
              fileFound = true;
              sendFile(alt);
              return;
            }
          }
        } catch (e) {
          console.error('[pdf->word] stat altPath error:', e);
        }
      }
    }

    // 如果进程已完成或检查次数较多，尝试查找目录中最新的docx文件
    if ((processCompleted || checkCount > 20) && checkCount > 5) {
      try {
        const files = fs
          .readdirSync(outputDir)
          .filter((f) => f.toLowerCase().endsWith('.docx'))
          .map((f) => {
            const full = path.join(outputDir, f);
            try {
              const stat = fs.statSync(full);
              return { full, mtime: stat.mtimeMs, size: stat.size };
            } catch {
              return null;
            }
          })
          .filter((f) => f && f.size > 0)
          .sort((a, b) => b.mtime - a.mtime);

        if (files.length > 0) {
          const recentFile = files.find((f) => Date.now() - f.mtime < 120000) || files[0];
          if (recentFile) {
            console.log('[pdf->word] found recent file:', recentFile.full, 'size:', recentFile.size);
            fileFound = true;
            sendFile(recentFile.full);
            return;
          }
        }
      } catch (e) {
        console.error('[pdf->word] scan error:', e);
      }
    }

    // 如果超过最大等待时间
    if (elapsed >= maxWaitTime || checkCount >= maxChecks) {
      console.error('[pdf->word] timeout waiting for file, elapsed:', elapsed, 'ms, checks:', checkCount, 'processCompleted:', processCompleted, 'processError:', processError);
      
      // 最后尝试一次：即使文件可能不完整，也尝试发送
      if (fs.existsSync(expectedPath)) {
        const stat = fs.statSync(expectedPath);
        if (stat.size > 0) {
          console.log('[pdf->word] trying to send file anyway:', expectedPath, 'size:', stat.size);
          fileFound = true;
          sendFile(expectedPath);
          return;
        }
      }
      // 检查所有备用路径
      for (const alt of [altPath, altPath2]) {
        if (fs.existsSync(alt)) {
          const stat = fs.statSync(alt);
          if (stat.size > 0) {
            console.log('[pdf->word] trying to send alt file anyway:', alt, 'size:', stat.size);
            fileFound = true;
            sendFile(alt);
            return;
          }
        }
      }

      // 最后扫描一次整个目录
      try {
        const files = fs
          .readdirSync(outputDir)
          .filter((f) => f.toLowerCase().endsWith('.docx'))
          .map((f) => {
            const full = path.join(outputDir, f);
            try {
              const stat = fs.statSync(full);
              return { full, mtime: stat.mtimeMs, size: stat.size };
            } catch {
              return null;
            }
          })
          .filter((f) => f && f.size > 0)
          .sort((a, b) => b.mtime - a.mtime);

        if (files.length > 0) {
          console.log('[pdf->word] trying to send latest file:', files[0].full, 'size:', files[0].size);
          fileFound = true;
          sendFile(files[0].full);
          return;
        }
      } catch (e) {
        console.error('[pdf->word] final scan error:', e);
      }

      safeUnlink(inputPath);
      if (!res.headersSent) {
        let errorMsg = '❌ 转换超时（240秒）';
        let suggestions = [];
        
        if (!pdf2docxAvailable && pythonAvailable) {
          suggestions.push('🔧 建议: pip install pdf2docx');
        }
        if (!sofficePath) {
          suggestions.push('🔧 建议: 安装 LibreOffice (https://www.libreoffice.org/download/)');
        }
        if (processError) {
          if (processError.killed || processError.signal === 'SIGTERM') {
            errorMsg += ' - LibreOffice进程被终止（文件可能过大）';
          } else {
            errorMsg += ' - 转换工具出错';
          }
        } else {
          errorMsg += ' - 转换工具未响应';
        }
        
        if (suggestions.length > 0) {
          errorMsg += '\n' + suggestions.join('\n');
        }
        
        res.status(500).json({ 
          message: errorMsg,
          error: 'CONVERSION_TIMEOUT',
          tips: suggestions 
        });
      }
      return;
    }

    // 继续等待
    setTimeout(checkFile, checkInterval);
  };

  const sendFile = (filePath) => {
    if (res.headersSent) {
      safeUnlink(filePath);
      safeUnlink(inputPath);
      return;
    }

    const downloadName = `${baseName}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(downloadName)}"`
    );

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('close', () => {
      safeUnlink(filePath);
      safeUnlink(inputPath);
    });
    stream.on('error', (e) => {
      console.error('[pdf->word] stream error:', e);
      safeUnlink(filePath);
      safeUnlink(inputPath);
      if (!res.headersSent) {
        res.status(500).json({ message: '文件读取失败' });
      }
    });
  };

  // 延迟1秒开始检查，给LibreOffice启动时间
  setTimeout(checkFile, 1000);
});

// PDF -> PPTX 接口（优化版：加快初始响应速度）
app.post('/api/convert/pdf-to-ppt', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: '请上传一个 PDF 文件' });
  }

  const inputPath = req.file.path;
  const outputDir = path.dirname(inputPath);
  const baseName = (req.file.originalname || 'slides').replace(/\.pdf$/i, '') || 'slides';

  console.log('[pdf->ppt] file received, size:', req.file.size, 'starting conversion...');
  console.log('[pdf->ppt] inputPath:', inputPath);
  console.log('[pdf->ppt] outputDir:', outputDir);
  console.log('[pdf->ppt] baseName:', baseName);

  // 预期的输出文件路径
  const expectedPath = path.join(outputDir, `${baseName}.pptx`);
  // LibreOffice 可能会生成不同名称的文件（如果输入文件没有扩展名）
  const inputFileName = path.basename(inputPath);
  const altPath = path.join(outputDir, `${inputFileName}.pptx`);
  const altPath2 = path.join(outputDir, `slides.pptx`);
  
  console.log('[pdf->ppt] expectedPath:', expectedPath);
  console.log('[pdf->ppt] altPath:', altPath);
  console.log('[pdf->ppt] altPath2:', altPath2);

  // 设置超时时间（如果使用Python则120秒，LibreOffice则180秒）
  const timeout = pdf2pptxAvailable ? 120000 : 180000;
  let fileFound = false;
  let processCompleted = false;
  let processError = null;

  // 优先使用Python转换器（更快）
  if (pdf2pptxAvailable) {
    console.log('[pdf->ppt] using Python converter (faster)');
    convertWithPython('ppt', inputPath, expectedPath, timeout, (err, outputPath) => {
      processCompleted = true;
      
      if (err) {
        console.error('[pdf->ppt] Python converter error:', err);
        processError = err;
        // 如果Python转换失败，回退到LibreOffice
        console.log('[pdf->ppt] falling back to LibreOffice');
        useLibreOfficeConverter();
        return;
      }
      
      // 检查outputPath和expectedPath
      const pathsToCheck = [outputPath, expectedPath].filter(p => p);
      let foundPath = null;
      
      for (const checkPath of pathsToCheck) {
        if (checkPath && fs.existsSync(checkPath)) {
          const stat = fs.statSync(checkPath);
          if (stat.size > 0) {
            foundPath = checkPath;
            break;
          }
        }
      }
      
      if (foundPath) {
        console.log('[pdf->ppt] Python conversion successful:', foundPath);
        fileFound = true;
        sendFile(foundPath);
      } else {
        console.error('[pdf->ppt] Python conversion completed but file not found at:', pathsToCheck);
        processError = new Error('转换完成但文件不存在');
        // 不立即回退，让checkFile继续查找
      }
    });
  } else {
    useLibreOfficeConverter();
  }

  function useLibreOfficeConverter() {
    // LibreOffice不支持PDF直接转PPTX，使用Python替代方案
    console.log('[pdf->ppt] 使用Python转换器（LibreOffice不支持PDF转PPTX）...');
    console.log('[pdf->ppt] inputPath:', inputPath);
    console.log('[pdf->ppt] outputDir:', outputDir);
    
    // 确保输入文件有.pdf扩展名
    let actualInputPath = inputPath;
    let tempPdfPath = null;
    if (!inputPath.toLowerCase().endsWith('.pdf')) {
      tempPdfPath = inputPath + '.pdf';
      try {
        fs.copyFileSync(inputPath, tempPdfPath);
        actualInputPath = tempPdfPath;
        console.log('[pdf->ppt] copied input file to:', actualInputPath);
      } catch (e) {
        console.error('[pdf->ppt] failed to copy input file:', e);
      }
    }
    
    // 使用Python转换脚本（pdf_converter.py已更新支持PDF转PPTX的替代方案）
    convertWithPython('ppt', actualInputPath || inputPath, expectedPath, timeout, (err, outputPath) => {
      processCompleted = true;
      
      if (err) {
        console.error('[pdf->ppt] Python converter error:', err);
        processError = err;
        fileFound = true;
        // 清理临时PDF文件
        if (tempPdfPath) {
          try {
            if (fs.existsSync(tempPdfPath)) {
              fs.unlinkSync(tempPdfPath);
            }
          } catch (e) {
            console.error('[pdf->ppt] failed to cleanup temp PDF:', e);
          }
        }
        safeUnlink(inputPath);
        if (!res.headersSent) {
          return res.status(500).json({
            message: 'PDF 转 PPT 失败，请检查 PDF 文件或转换依赖',
            error: err.message,
          });
        }
        return;
      }
      
      // 检查outputPath和expectedPath
      const pathsToCheck = [outputPath, expectedPath].filter(p => p);
      let foundPath = null;
      
      for (const checkPath of pathsToCheck) {
        if (checkPath && fs.existsSync(checkPath)) {
          const stat = fs.statSync(checkPath);
          if (stat.size > 0) {
            foundPath = checkPath;
            break;
          }
        }
      }
      
      if (foundPath) {
        console.log('[pdf->ppt] Python conversion successful:', foundPath);
        fileFound = true;
        sendFile(foundPath);
      } else {
        console.error('[pdf->ppt] Python conversion completed but file not found at:', pathsToCheck);
        processError = new Error('转换完成但文件不存在');
      }
      
      // 清理临时PDF文件
      if (tempPdfPath) {
        try {
          if (fs.existsSync(tempPdfPath)) {
            fs.unlinkSync(tempPdfPath);
          }
        } catch (e) {
          console.error('[pdf->ppt] failed to cleanup temp PDF:', e);
        }
      }
    });
  }

  // 轮询检查文件是否生成（每500ms检查一次，最多等待180秒）
  const checkInterval = 500;
  const maxWaitTime = 180000; // 增加到180秒
  const startTime = Date.now();
  let checkCount = 0;
  const maxChecks = Math.floor(maxWaitTime / checkInterval);

  const checkFile = () => {
    if (fileFound || res.headersSent) {
      return;
    }

    checkCount++;
    const elapsed = Date.now() - startTime;
    
    // 每20次检查输出一次日志
    if (checkCount % 20 === 0) {
      console.log(`[pdf->ppt] checking... count: ${checkCount}, elapsed: ${Math.round(elapsed/1000)}s, processCompleted: ${processCompleted}`);
    }

    // 优先检查预期路径（放宽条件：如果文件存在且大小>0，立即发送）
    if (fs.existsSync(expectedPath)) {
      try {
        const stat = fs.statSync(expectedPath);
        if (stat.size > 0) {
          // 放宽条件：如果文件存在且大小>0，立即发送（不等待进程完成）
          const fileAge = Date.now() - stat.mtimeMs;
          // 如果文件在最近2分钟内被修改，或者进程已完成，或者检查次数>10，立即发送
          if (fileAge < 120000 || processCompleted || checkCount > 10) {
            console.log('[pdf->ppt] found file at expectedPath:', expectedPath, 'size:', stat.size, 'age:', fileAge, 'ms');
            fileFound = true;
            sendFile(expectedPath);
            return;
          }
        }
      } catch (e) {
        console.error('[pdf->ppt] stat error:', e);
      }
    }

    // 检查备用路径
    const altPaths = [altPath, altPath2];
    for (const alt of altPaths) {
      if (fs.existsSync(alt)) {
        try {
          const stat = fs.statSync(alt);
          if (stat.size > 0) {
            const fileAge = Date.now() - stat.mtimeMs;
            // 放宽条件：如果文件在最近2分钟内被修改，或者进程已完成，或者检查次数>10，立即发送
            if (fileAge < 120000 || processCompleted || checkCount > 10) {
              console.log('[pdf->ppt] found file at altPath:', alt, 'size:', stat.size, 'age:', fileAge, 'ms');
              fileFound = true;
              sendFile(alt);
              return;
            }
          }
        } catch (e) {
          console.error('[pdf->ppt] stat altPath error:', e);
        }
      }
    }

    // 如果进程已完成或检查次数较多，尝试查找目录中最新的pptx文件
    if ((processCompleted || checkCount > 20) && checkCount > 5) {
      try {
        const files = fs
          .readdirSync(outputDir)
          .filter((f) => f.toLowerCase().endsWith('.pptx'))
          .map((f) => {
            const full = path.join(outputDir, f);
            try {
              const stat = fs.statSync(full);
              return { full, mtime: stat.mtimeMs, size: stat.size };
            } catch {
              return null;
            }
          })
          .filter((f) => f && f.size > 0)
          .sort((a, b) => b.mtime - a.mtime);

        if (files.length > 0) {
          // 放宽条件：查找最近2分钟内修改的文件
          const recentFile = files.find((f) => Date.now() - f.mtime < 120000) || files[0];
          if (recentFile) {
            console.log('[pdf->ppt] found recent file:', recentFile.full, 'size:', recentFile.size, 'age:', Date.now() - recentFile.mtime);
            fileFound = true;
            sendFile(recentFile.full);
            return;
          }
        }
      } catch (e) {
        console.error('[pdf->ppt] scan error:', e);
      }
    }

    // 如果超过最大等待时间
    if (elapsed >= maxWaitTime || checkCount >= maxChecks) {
      console.error('[pdf->ppt] timeout waiting for file, elapsed:', elapsed, 'ms, checks:', checkCount, 'processCompleted:', processCompleted, 'processError:', processError);
      
      // 最后尝试一次：即使文件可能不完整，也尝试发送
      if (fs.existsSync(expectedPath)) {
        const stat = fs.statSync(expectedPath);
        if (stat.size > 0) {
          console.log('[pdf->ppt] trying to send file anyway:', expectedPath, 'size:', stat.size);
          fileFound = true;
          sendFile(expectedPath);
          return;
        }
      }
      // 检查所有备用路径
      for (const alt of [altPath, altPath2]) {
        if (fs.existsSync(alt)) {
          const stat = fs.statSync(alt);
          if (stat.size > 0) {
            console.log('[pdf->ppt] trying to send alt file anyway:', alt, 'size:', stat.size);
            fileFound = true;
            sendFile(alt);
            return;
          }
        }
      }

      // 最后扫描一次整个目录
      try {
        const files = fs
          .readdirSync(outputDir)
          .filter((f) => f.toLowerCase().endsWith('.pptx'))
          .map((f) => {
            const full = path.join(outputDir, f);
            try {
              const stat = fs.statSync(full);
              return { full, mtime: stat.mtimeMs, size: stat.size };
            } catch {
              return null;
            }
          })
          .filter((f) => f && f.size > 0)
          .sort((a, b) => b.mtime - a.mtime);

        if (files.length > 0) {
          console.log('[pdf->ppt] trying to send latest file:', files[0].full, 'size:', files[0].size);
          fileFound = true;
          sendFile(files[0].full);
          return;
        }
      } catch (e) {
        console.error('[pdf->ppt] final scan error:', e);
      }

      safeUnlink(inputPath);
      if (!res.headersSent) {
        let errorMsg = '❌ 转换超时（180秒）';
        let suggestions = [];
        
        if (!pdf2pptxAvailable && pythonAvailable) {
          suggestions.push('🔧 建议: pip install pdf2pptx');
        }
        if (!sofficePath) {
          suggestions.push('🔧 建议: 安装 LibreOffice (https://www.libreoffice.org/download/)');
        }
        if (processError) {
          if (processError.killed || processError.signal === 'SIGTERM') {
            errorMsg += ' - 处理工具被中止（文件可能过大）';
          } else {
            errorMsg += ' - 转换工具出错';
          }
        } else {
          errorMsg += ' - 转换工具未响应';
        }
        
        if (suggestions.length > 0) {
          errorMsg += '\n' + suggestions.join('\n');
        }
        
        res.status(500).json({ 
          message: errorMsg,
          error: 'CONVERSION_TIMEOUT',
          tips: suggestions 
        });
      }
      return;
    }

    // 继续等待
    setTimeout(checkFile, checkInterval);
  };

  const sendFile = (filePath) => {
    if (res.headersSent) {
      safeUnlink(filePath);
      safeUnlink(inputPath);
      return;
    }

    const downloadName = `${baseName}.pptx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(downloadName)}"`
    );

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('close', () => {
      safeUnlink(filePath);
      safeUnlink(inputPath);
    });
    stream.on('error', (e) => {
      console.error('[pdf->ppt] stream error:', e);
      safeUnlink(filePath);
      safeUnlink(inputPath);
      if (!res.headersSent) {
        res.status(500).json({ message: '文件读取失败' });
      }
    });
  };

  // 延迟1秒开始检查，给LibreOffice启动时间
  setTimeout(checkFile, 1000);
});

// PDF -> Excel (XLSX) 接口
app.post('/api/convert/pdf-to-excel', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: '请上传一个 PDF 文件' });
  }

  const inputPath = req.file.path;
  const outputDir = path.dirname(inputPath);
  const baseName = (req.file.originalname || 'table').replace(/\.pdf$/i, '') || 'table';
  const expectedPath = path.join(outputDir, `${baseName}.xlsx`);

  console.log('[pdf->excel] input:', inputPath);

  const sendExcel = (filePath) => {
    if (res.headersSent) {
      safeUnlink(filePath);
      safeUnlink(inputPath);
      return;
    }

    const downloadName = `${baseName}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(downloadName)}"`
    );

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('close', () => {
      safeUnlink(filePath);
      safeUnlink(inputPath);
    });
    stream.on('error', (e) => {
      console.error('[pdf->excel] stream error:', e);
      safeUnlink(filePath);
      safeUnlink(inputPath);
      if (!res.headersSent) {
        res.status(500).json({ message: '文件读取失败' });
      }
    });
  };

  const useLibreOfficeConverter = () => {
    if (!sofficePath) {
      safeUnlink(inputPath);
      return res.status(500).json({ message: 'PDF 转 Excel 失败，服务器转换依赖不可用' });
    }

    const actualInputPath = inputPath.toLowerCase().endsWith('.pdf') ? inputPath : inputPath + '.pdf';
    try {
      if (actualInputPath !== inputPath) {
        fs.copyFileSync(inputPath, actualInputPath);
      }
    } catch (e) {
      console.error('[pdf->excel] failed to prepare input file:', e);
      safeUnlink(inputPath);
      return res.status(500).json({ message: '转换失败，无法准备临时 PDF 文件' });
    }

    execFile(
      sofficePath,
      [
        '--headless',
        '--invisible',
        '--nodefault',
        '--nolockcheck',
        '--norestore',
        '--nofirststartwizard',
        '--nologo',
        '--convert-to',
        'xlsx',
        actualInputPath,
        '--outdir',
        outputDir,
      ],
      {
        maxBuffer: 20 * 1024 * 1024,
        env: { ...process.env, SAL_DISABLE_OPENCL: '1' }
      },
      (err) => {
        if (err) {
          console.error('[pdf->excel] soffice error:', err);
          safeUnlink(actualInputPath);
          safeUnlink(inputPath);
          return res.status(500).json({ message: 'PDF 转 Excel 失败' });
        }

        const xlsPath = path.join(
          outputDir,
          `${path.basename(actualInputPath, path.extname(actualInputPath))}.xlsx`
        );
        const finalPath = fs.existsSync(xlsPath) ? xlsPath : expectedPath;

        if (!fs.existsSync(finalPath)) {
          console.error('[pdf->excel] xlsx not found:', xlsPath, expectedPath);
          safeUnlink(actualInputPath);
          safeUnlink(inputPath);
          return res.status(500).json({ message: '转换失败，未找到生成的 Excel 文件' });
        }

        if (actualInputPath !== inputPath) {
          safeUnlink(actualInputPath);
        }
        sendExcel(finalPath);
      }
    );
  };

  convertWithPython('excel', inputPath, expectedPath, 120000, (err, outputPath) => {
    if (!err && outputPath && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      console.log('[pdf->excel] Python conversion successful:', outputPath);
      return sendExcel(outputPath);
    }

    if (err) {
      console.error('[pdf->excel] Python converter error:', err);
    }
    console.log('[pdf->excel] falling back to LibreOffice');
    useLibreOfficeConverter();
  });
});

// ====================== 前端静态资源托管 ======================
function getAudioCodecArgs(format) {
  switch (format) {
    case 'mp3':
      return ['-vn', '-codec:a', 'libmp3lame', '-b:a', '192k'];
    case 'wav':
      return ['-vn', '-codec:a', 'pcm_s16le'];
    case 'flac':
      return ['-vn', '-codec:a', 'flac'];
    case 'aac':
    case 'm4a':
      return ['-vn', '-codec:a', 'aac', '-b:a', '192k'];
    case 'ogg':
      return ['-vn', '-codec:a', 'libvorbis', '-q:a', '5'];
    case 'opus':
      return ['-vn', '-codec:a', 'libopus', '-b:a', '128k'];
    case 'wma':
      return ['-vn', '-codec:a', 'wmav2', '-b:a', '192k'];
    case 'aiff':
      return ['-vn', '-codec:a', 'pcm_s16be'];
    default:
      return ['-vn'];
  }
}

function getDownloadBaseName(originalName, fallback) {
  const parsed = path.parse(originalName || fallback || 'audio');
  return parsed.name || 'audio';
}

// Audio format conversion
app.post('/api/convert/audio', audioUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: '请上传一个音频文件' });
  }
  if (!ffmpegPath) {
    safeUnlink(req.file.path);
    return res.status(503).json({ message: '音频转换需要服务器安装 FFmpeg' });
  }

  const targetFormat = String(req.body.format || '').toLowerCase().replace(/^\./, '');
  if (!AUDIO_FORMATS.has(targetFormat)) {
    safeUnlink(req.file.path);
    return res.status(400).json({ message: '请选择有效的目标音频格式' });
  }

  const originalExt = path.extname(req.file.originalname || '').toLowerCase().replace(/^\./, '');
  if (originalExt && !AUDIO_FORMATS.has(originalExt)) {
    safeUnlink(req.file.path);
    return res.status(400).json({ message: '暂不支持该音频源格式' });
  }

  const inputPath = req.file.path;
  const outputDir = path.dirname(inputPath);
  const actualInputPath = originalExt ? `${inputPath}.${originalExt}` : inputPath;
  const outputPath = path.join(outputDir, `${path.basename(inputPath)}_converted.${targetFormat}`);
  const downloadName = `${getDownloadBaseName(req.file.originalname, 'audio')}.${targetFormat}`;

  try {
    if (actualInputPath !== inputPath) {
      fs.copyFileSync(inputPath, actualInputPath);
    }
  } catch (e) {
    console.error('[audio] failed to prepare input file:', e);
    safeUnlink(inputPath);
    return res.status(500).json({ message: '转换失败，无法准备临时音频文件' });
  }

  const args = ['-y', '-i', actualInputPath, ...getAudioCodecArgs(targetFormat), outputPath];
  console.log('[audio] converting:', req.file.originalname, 'to', targetFormat);

  execFile(ffmpegPath, args, { timeout: 180000, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err) {
      console.error('[audio] ffmpeg error:', err);
      if (stderr) console.error('[audio] ffmpeg stderr:', stderr);
      safeUnlink(outputPath);
      safeUnlink(actualInputPath);
      safeUnlink(inputPath);
      return res.status(400).json({ message: '音频转换失败，请检查文件是否为有效音频' });
    }

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      safeUnlink(outputPath);
      safeUnlink(actualInputPath);
      safeUnlink(inputPath);
      return res.status(500).json({ message: '转换失败，未找到生成的音频文件' });
    }

    res.setHeader('Content-Type', AUDIO_MIME_TYPES[targetFormat] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);

    const stream = fs.createReadStream(outputPath);
    stream.pipe(res);
    stream.on('close', () => {
      safeUnlink(outputPath);
      safeUnlink(actualInputPath);
      safeUnlink(inputPath);
    });
    stream.on('error', (e) => {
      console.error('[audio] stream error:', e);
      safeUnlink(outputPath);
      safeUnlink(actualInputPath);
      safeUnlink(inputPath);
    });
  });
});

const staticRoot = path.join(__dirname, 'dist', 'build', 'h5');
const imageToolsPath = path.join(__dirname, 'image-tools.html');

// 1) 优先处理根路径和 /image-tools*.html，强制返回自定义 image-tools.html
app.get(['/', '/image-tools.html', '/image-tools'], (req, res) => {
  if (fs.existsSync(imageToolsPath)) {
    return res.sendFile(imageToolsPath);
  }
  // 找不到自定义页面时，退回到 H5 的 index.html（如果存在）
  const indexPath = path.join(staticRoot, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res.status(500).send('前端资源未正确构建，请检查 image-tools.html 或执行 npm run build:h5');
});

// 2) 如果存在 H5 打包结果，则托管该目录（静态资源）
if (fs.existsSync(staticRoot)) {
  console.log('[static] serving H5 assets from:', staticRoot);
  app.use(express.static(staticRoot));
} else {
  console.log('[static] H5 build directory not found, only custom HTML will be available. Expected:', staticRoot);
}

// 3) 同时托管当前项目根目录，确保 image-tools.html 及其资源可访问
app.use(express.static(__dirname));

const PORT = 9999;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

