'use client'

import { useState } from 'react'
import * as yaml from 'js-yaml'
import { CopyButton } from './CopyButton'

const iconClass = 'w-4 h-4 shrink-0'

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v7.5M8 9.5L5 6.5M8 9.5l3-3M2.5 12v.5a1 1 0 001 1h9a1 1 0 001-1V12" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 16 16" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 9.5V2M8 2L5 5M8 2l3 3M2.5 12v.5a1 1 0 001 1h9a1 1 0 001-1V12" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M3.5 10.5h-1a1 1 0 01-1-1v-6a1 1 0 011-1h6a1 1 0 011 1v1" />
    </svg>
  )
}

const buttonClass = 'w-full flex items-center justify-center gap-2 text-md px-4 py-2 rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:border-neutral-500 hover:text-neutral-100 active:scale-[0.98] transition-all duration-150 cursor-pointer'

export function YamlIOSection({ label, filename, data, setData, downloadId, uploadId, downloads, downloadLabel = 'Download YAML' }: {
  label: string
  filename: string
  data: string | null
  setData: (value: string) => void
  downloadId?: string
  uploadId?: string
  downloads?: { filename: string; data: string | null }[]
  downloadLabel?: string
}) {
  const [showAsYaml, setShowAsYaml] = useState(false)

  const toYamlText = (value = data) => {
    try { return yaml.dump(JSON.parse(value ?? '')) } catch { return value ?? '' }
  }

  function handleDownload() {
    for (const file of downloads ?? [{ filename, data }]) {
      const url = URL.createObjectURL(new Blob([toYamlText(file.data)], { type: 'text/yaml' }))
      const a = document.createElement('a')
      a.href = url
      a.download = file.filename
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  function handleUpload(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try { setData(JSON.stringify(yaml.load(String(reader.result)), null, 2)) } catch { /* ignore invalid yaml */ }
    }
    reader.readAsText(file)
  }

  return (
    <div className="space-y-1">
      <div className="border-b border-neutral-800 pb-3 mb-3">
        <h2 className="text-lg font-semibold tracking-tight">Export {label}</h2>
      </div>
      <div className="space-y-2">
        <button
          id={downloadId}
          onClick={handleDownload}
          title={`Download ${label} .yaml file`}
          className={buttonClass}
        >
          <DownloadIcon />
          {downloadLabel}
        </button>
        {/* <label id={uploadId} title={`Upload ${label} .yaml file`} className={buttonClass}>
          <UploadIcon />
          Upload YAML
          <input
            type="file"
            accept=".yaml,.yml"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }}
          />
        </label>
        <CopyButton
          getText={toYamlText}
          label="Copy YAML"
          copiedLabel="Copied!"
          icon={<CopyIcon />}
          className={buttonClass}
        /> */}
      </div>
      <button
        onClick={() => setShowAsYaml(v => !v)}
        className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
      >
        {showAsYaml ? '▾ Hide YAML' : '▸ Show YAML'}
      </button>
      {showAsYaml && (
        <textarea
          disabled
          value={toYamlText()}
          className="w-full h-96 p-2 rounded-lg border border-neutral-700 bg-neutral-900 text-sm text-neutral-200 resize-y font-mono"
        />
      )}
    </div>
  )
}
