<template>
  <view class="page">
    <view class="hero">
      <view class="hero-top">
        <view>
          <text class="eyebrow">SMART FILE TOOLS</text>
          <text class="title">文件工具箱</text>
          <text class="subtitle">先上传文件，自动识别类型，再选择要转换成什么格式。</text>
        </view>
        <view class="status-pill" :class="{ online: serverOnline }">
          <view class="status-dot"></view>
          <text>{{ serverOnline ? '服务在线' : '检测中' }}</text>
        </view>
      </view>
    </view>

    <view class="smart-card">
      <view class="smart-header">
        <text class="smart-title">智能转换</text>
        <text class="smart-subtitle">不用先找工具，上传后自动推荐转换方式。</text>
      </view>

      <view class="upload-box" @click="pickSmartFile">
        <text class="upload-icon">☁️</text>
        <text class="upload-title">{{ smartFileName ? '重新选择文件' : '上传文件自动识别' }}</text>
        <text class="upload-hint">支持 Word、PDF、图片、音频文件</text>
      </view>

      <view v-if="smartFileName" class="detect-card">
        <view>
          <text class="detect-label">已识别为</text>
          <text class="detect-type">{{ detectedLabel }}</text>
          <text class="detect-name">{{ smartFileName }}</text>
        </view>
      </view>

      <view v-if="smartFileName && smartTargets.length" class="target-section">
        <text class="section-title small">可以转换为</text>
        <view class="target-grid">
          <button
            v-for="target in smartTargets"
            :key="target.key"
            class="target-btn"
            @click="convertSmart(target)"
          >
            {{ target.label }}
          </button>
        </view>
      </view>

      <view v-if="smartFileName && !smartTargets.length" class="empty-tip">
        <text>暂时没有匹配的转换方式，可以换一个 Word、PDF、图片或音频文件。</text>
      </view>

      <view v-if="convertStatus" class="result-card">
        <text class="result-label">处理状态</text>
        <text class="result-status">{{ convertStatus }}</text>
      </view>
    </view>

    <view class="home-section">
      <text class="section-title">也可以按工具进入</text>
      <view
        v-for="tool in tools"
        :key="tool.key"
        class="tool-card"
        :class="tool.theme"
        @click="openTool(tool.key)"
      >
        <view class="tool-icon">{{ tool.icon }}</view>
        <view class="tool-copy">
          <view class="tool-title-row">
            <text class="tool-title">{{ tool.title }}</text>
            <text v-if="tool.badge" class="tool-badge">{{ tool.badge }}</text>
          </view>
          <text class="tool-desc">{{ tool.desc }}</text>
        </view>
        <text class="tool-arrow">›</text>
      </view>
    </view>

    <view v-if="activeTool !== 'home'" class="drawer-mask" @click="goHome">
      <view class="tool-sheet" @click.stop>
        <button class="sheet-close" @click="goHome">关闭</button>

        <view v-if="activeTool === 'image'">
          <text class="sheet-title">图片转换工具</text>
          <text class="sheet-subtitle">手机端推荐直接从智能上传入口选择图片，系统会给出“图片转 PDF”等选项。</text>
          <button class="primary-btn" @click="pickSmartFile">上传图片</button>
          <button class="ghost-btn" @click="openWebTool">打开网页完整版</button>
        </view>

        <view v-if="activeTool === 'document'">
          <text class="sheet-title">文档转换工具</text>
          <text class="sheet-subtitle">上传 Word 或 PDF 后，自动展示可转换格式。</text>
          <button class="primary-btn" @click="pickSmartFile">上传文档</button>
        </view>

        <view v-if="activeTool === 'audio'">
          <text class="sheet-title">音频转换工具</text>
          <text class="sheet-subtitle">上传音频后，自动列出 MP3、WAV、FLAC、M4A 等目标格式。</text>
          <button class="primary-btn" @click="pickSmartFile">上传音频</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
const API_BASE = 'https://your-domain.example'

export default {
  data() {
    return {
      serverOnline: false,
      activeTool: 'home',
      smartFileName: '',
      smartFilePath: '',
      smartFileExt: '',
      smartFileType: 'unknown',
      convertStatus: '',
      tools: [
        {
          key: 'image',
          icon: '🖼️',
          title: '图片转换工具',
          badge: '推荐',
          desc: '图片转 PDF、格式处理、素材转换。',
          theme: 'blue',
        },
        {
          key: 'document',
          icon: '📄',
          title: '文档转换工具',
          badge: '',
          desc: 'Word、PDF、PPT、Excel 常见互转。',
          theme: 'green',
        },
        {
          key: 'audio',
          icon: '🎧',
          title: '音频转换工具',
          badge: 'NEW',
          desc: 'MP3、WAV、FLAC、M4A 等音频格式互转。',
          theme: 'mint',
        },
      ],
      audioFormats: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma', 'aiff'],
      imageFormats: ['png', 'jpg', 'webp'],
      wordTargets: ['pdf', 'docx', 'doc', 'rtf', 'odt', 'html', 'txt'],
      spreadsheetTargets: ['pdf', 'xlsx', 'xls', 'csv'],
      presentationTargets: ['pdf', 'pptx', 'ppt'],
    }
  },
  computed: {
    detectedLabel() {
      const labels = {
        word: 'Word 文档',
        spreadsheet: '表格文件',
        presentation: '演示文稿',
        pdf: 'PDF 文档',
        image: '图片文件',
        audio: '音频文件',
        unknown: '未知文件',
      }
      return labels[this.smartFileType] || labels.unknown
    },
    smartTargets() {
      if (this.smartFileType === 'word') {
        return this.officeTargets(this.wordTargets)
      }
      if (this.smartFileType === 'spreadsheet') {
        return this.officeTargets(this.spreadsheetTargets)
      }
      if (this.smartFileType === 'presentation') {
        return this.officeTargets(this.presentationTargets)
      }
      if (this.smartFileType === 'pdf') {
        return [
          { key: 'pdf-word', label: '转为 Word', endpoint: '/api/convert/pdf-to-word', fieldName: 'file', resultName: 'document.docx' },
          { key: 'pdf-ppt', label: '转为 PPT', endpoint: '/api/convert/pdf-to-ppt', fieldName: 'file', resultName: 'slides.pptx' },
          { key: 'pdf-excel', label: '转为 Excel', endpoint: '/api/convert/pdf-to-excel', fieldName: 'file', resultName: 'sheet.xlsx' },
        ]
      }
      if (this.smartFileType === 'image') {
        return [
          ...this.imageFormats
            .filter((format) => this.normalizeImageExt(this.smartFileExt) !== format)
            .map((format) => ({
              key: `image-${format}`,
              label: `转为 ${format.toUpperCase()}`,
              endpoint: '',
              fieldName: 'images',
              resultName: `image.${format}`,
            })),
          { key: 'image-pdf', label: '转为 PDF', endpoint: '/api/convert/image-to-pdf', fieldName: 'images', resultName: 'images.pdf' },
        ]
      }
      if (this.smartFileType === 'audio') {
        return this.audioFormats
          .filter((format) => format !== this.smartFileExt)
          .map((format) => ({
            key: `audio-${format}`,
            label: `转为 ${format.toUpperCase()}`,
            endpoint: '/api/convert/audio',
            fieldName: 'file',
            resultName: `audio.${format}`,
            formData: { format },
          }))
      }
      return []
    },
  },
  onLoad() {
    this.checkServer()
  },
  methods: {
    async checkServer() {
      try {
        const [err, res] = await uni.request({ url: `${API_BASE}/api/system/status`, timeout: 6000 })
        this.serverOnline = !err && res && res.statusCode === 200
      } catch (e) {
        this.serverOnline = false
      }
    },
    openTool(key) {
      this.activeTool = key
    },
    goHome() {
      this.activeTool = 'home'
    },
    openWebTool() {
      // #ifdef H5
      window.location.href = `${API_BASE}/image-tools.html`
      // #endif
      // #ifndef H5
      plus.runtime.openURL(`${API_BASE}/image-tools.html`)
      // #endif
    },
    pickSmartFile() {
      uni.chooseFile({
        count: 1,
        type: 'all',
        success: (res) => {
          const file = res.tempFiles && res.tempFiles[0]
          const path = res.tempFilePaths && res.tempFilePaths[0]
          if (!file || !path) return

          this.smartFileName = file.name || 'selected-file'
          this.smartFilePath = path
          this.smartFileExt = this.getExtension(this.smartFileName)
          this.smartFileType = this.detectFileType(this.smartFileExt)
          this.convertStatus = ''
          this.activeTool = 'home'
        },
        fail: () => {
          uni.showToast({ title: '未选择文件', icon: 'none' })
        },
      })
    },
    getExtension(fileName) {
      const parts = String(fileName || '').toLowerCase().split('.')
      return parts.length > 1 ? parts.pop() : ''
    },
    detectFileType(ext) {
      if (['doc', 'docx'].includes(ext)) return 'word'
      if (['xls', 'xlsx', 'csv'].includes(ext)) return 'spreadsheet'
      if (['ppt', 'pptx'].includes(ext)) return 'presentation'
      if (ext === 'pdf') return 'pdf'
      if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'].includes(ext)) return 'image'
      if (this.audioFormats.includes(ext)) return 'audio'
      return 'unknown'
    },
    officeTargets(formats) {
      return formats
        .filter((format) => format !== this.smartFileExt)
        .map((format) => ({
          key: `office-${format}`,
          label: `转为 ${format.toUpperCase()}`,
          endpoint: '/api/convert/office',
          fieldName: 'file',
          resultName: `document.${format}`,
          formData: { format },
        }))
    },
    normalizeImageExt(ext) {
      return ext === 'jpeg' ? 'jpg' : ext
    },
    convertSmart(target) {
      if (!this.smartFilePath) {
        uni.showToast({ title: '请先上传文件', icon: 'none' })
        return
      }
      this.uploadFile({
        filePath: this.smartFilePath,
        url: `${API_BASE}${target.endpoint}`,
        fieldName: target.fieldName || 'file',
        formData: target.formData || {},
        downloadName: target.resultName,
      })
    },
    uploadFile({ filePath, url, fieldName, formData, downloadName }) {
      this.convertStatus = '正在上传并转换...'
      uni.showLoading({ title: '转换中' })
      uni.uploadFile({
        url,
        filePath,
        name: fieldName,
        formData,
        success: (res) => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            this.convertStatus = '转换失败，请换个文件重试'
            uni.showToast({ title: '转换失败', icon: 'none' })
            return
          }
          this.convertStatus = `转换完成：${downloadName}`
          uni.showToast({ title: '转换完成', icon: 'success' })
          this.handleConvertedFile(res.tempFilePath, downloadName)
        },
        fail: () => {
          this.convertStatus = '网络异常或服务不可用'
          uni.showToast({ title: '上传失败', icon: 'none' })
        },
        complete: () => {
          uni.hideLoading()
        },
      })
    },
    handleConvertedFile(tempFilePath, downloadName) {
      if (!tempFilePath) return
      // #ifdef H5
      uni.showToast({ title: '请在浏览器下载栏查看文件', icon: 'none' })
      // #endif
      // #ifndef H5
      uni.saveFile({
        tempFilePath,
        success: (saveRes) => {
          uni.showModal({
            title: '转换完成',
            content: `文件已保存：${downloadName}`,
            confirmText: '打开',
            success: (modalRes) => {
              if (modalRes.confirm) {
                uni.openDocument({ filePath: saveRes.savedFilePath, showMenu: true })
              }
            },
          })
        },
      })
      // #endif
    },
  },
}
</script>

<style>
page {
  background: #f4f7fb;
}

.page {
  min-height: 100vh;
  padding: 34rpx 28rpx 56rpx;
  box-sizing: border-box;
  background:
    radial-gradient(circle at 8% 4%, rgba(22, 119, 255, 0.16), transparent 34%),
    radial-gradient(circle at 94% 12%, rgba(43, 210, 126, 0.16), transparent 30%),
    #f4f7fb;
}

.hero,
.smart-card,
.tool-card,
.tool-sheet,
.result-card {
  background: #ffffff;
  border: 1rpx solid #e4e7ec;
  box-shadow: 0 18rpx 42rpx rgba(15, 23, 42, 0.07);
}

.hero {
  padding: 30rpx;
  border-radius: 34rpx;
  color: #101828;
  background: linear-gradient(145deg, #ffffff 0%, #eef6ff 100%);
}

.hero-top {
  display: flex;
  justify-content: space-between;
  gap: 24rpx;
}

.eyebrow,
.title,
.subtitle,
.smart-title,
.smart-subtitle,
.section-title,
.tool-title,
.tool-desc,
.detect-label,
.detect-type,
.detect-name,
.upload-title,
.upload-hint,
.result-label,
.result-status,
.sheet-title,
.sheet-subtitle {
  display: block;
}

.eyebrow {
  color: #1677ff;
  font-size: 22rpx;
  font-weight: 800;
  letter-spacing: 0;
}

.title {
  margin-top: 8rpx;
  font-size: 50rpx;
  line-height: 1.16;
  font-weight: 900;
}

.subtitle {
  margin-top: 12rpx;
  max-width: 460rpx;
  color: #667085;
  font-size: 27rpx;
  line-height: 1.55;
}

.status-pill {
  height: 56rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  background: #f2f4f7;
  color: #667085;
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: 23rpx;
  white-space: nowrap;
}

.status-pill.online {
  color: #079455;
  background: #ecfdf3;
}

.status-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: currentColor;
}

.smart-card {
  margin-top: 28rpx;
  padding: 28rpx;
  border-radius: 34rpx;
}

.smart-header {
  margin-bottom: 22rpx;
}

.smart-title,
.section-title {
  color: #101828;
  font-size: 34rpx;
  font-weight: 900;
}

.section-title.small {
  margin-top: 28rpx;
  margin-bottom: 16rpx;
  font-size: 28rpx;
}

.smart-subtitle {
  margin-top: 8rpx;
  color: #667085;
  font-size: 25rpx;
  line-height: 1.45;
}

.upload-box {
  padding: 46rpx 28rpx;
  border-radius: 30rpx;
  border: 2rpx dashed rgba(22, 119, 255, 0.24);
  background: linear-gradient(145deg, #f8fbff, #f2f8ff);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.upload-icon {
  font-size: 64rpx;
}

.upload-title {
  margin-top: 14rpx;
  color: #101828;
  font-size: 31rpx;
  font-weight: 900;
}

.upload-hint {
  margin-top: 10rpx;
  color: #667085;
  font-size: 24rpx;
}

.detect-card {
  margin-top: 20rpx;
  padding: 22rpx;
  border-radius: 24rpx;
  background: #f9fafb;
  border: 1rpx solid #eaecf0;
}

.detect-label {
  color: #98a2b3;
  font-size: 22rpx;
}

.detect-type {
  margin-top: 6rpx;
  color: #101828;
  font-size: 32rpx;
  font-weight: 900;
}

.detect-name {
  margin-top: 8rpx;
  color: #667085;
  font-size: 24rpx;
  line-height: 1.45;
}

.target-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
}

.target-btn,
.primary-btn,
.ghost-btn,
.sheet-close {
  border-radius: 999rpx;
  font-size: 27rpx;
}

.target-btn,
.primary-btn {
  color: #ffffff;
  background: linear-gradient(135deg, #1677ff, #31a8ff);
  box-shadow: 0 14rpx 28rpx rgba(22, 119, 255, 0.22);
}

.empty-tip {
  margin-top: 22rpx;
  color: #667085;
  font-size: 25rpx;
  line-height: 1.45;
}

.result-card {
  margin-top: 20rpx;
  padding: 22rpx;
  border-radius: 24rpx;
}

.result-label {
  color: #98a2b3;
  font-size: 22rpx;
}

.result-status {
  margin-top: 8rpx;
  color: #1677ff;
  font-size: 26rpx;
  font-weight: 700;
}

.home-section {
  margin-top: 34rpx;
}

.section-title {
  margin-bottom: 18rpx;
}

.tool-card {
  min-height: 168rpx;
  margin-bottom: 20rpx;
  padding: 26rpx;
  border-radius: 30rpx;
  display: flex;
  align-items: center;
  gap: 22rpx;
}

.tool-card.blue {
  background: linear-gradient(135deg, #ffffff, #eff7ff);
}

.tool-card.green {
  background: linear-gradient(135deg, #ffffff, #effbf5);
}

.tool-card.mint {
  background: linear-gradient(135deg, #ffffff, #effafa);
}

.tool-icon {
  width: 82rpx;
  height: 82rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(22, 119, 255, 0.08);
  font-size: 40rpx;
}

.tool-copy {
  flex: 1;
}

.tool-title-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.tool-title {
  color: #101828;
  font-size: 32rpx;
  font-weight: 900;
}

.tool-badge {
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  color: #1677ff;
  background: rgba(22, 119, 255, 0.08);
  border: 1rpx solid rgba(22, 119, 255, 0.14);
  font-size: 21rpx;
}

.tool-desc {
  margin-top: 12rpx;
  color: #667085;
  font-size: 25rpx;
  line-height: 1.45;
}

.tool-arrow {
  color: #98a2b3;
  font-size: 54rpx;
}

.drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 20;
  padding: 30rpx;
  display: flex;
  align-items: flex-end;
  background: rgba(15, 23, 42, 0.28);
}

.tool-sheet {
  width: 100%;
  padding: 30rpx;
  border-radius: 34rpx;
}

.sheet-close {
  width: 160rpx;
  margin: 0 0 20rpx auto;
  color: #475467;
  background: #f2f4f7;
}

.sheet-title {
  color: #101828;
  font-size: 36rpx;
  font-weight: 900;
}

.sheet-subtitle {
  margin-top: 12rpx;
  margin-bottom: 24rpx;
  color: #667085;
  font-size: 26rpx;
  line-height: 1.55;
}

.primary-btn,
.ghost-btn {
  margin-top: 16rpx;
}

.ghost-btn {
  color: #1677ff;
  background: #eef6ff;
}
</style>
