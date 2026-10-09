'use client'

import { StructuredOutputField, type StructuredOutputFieldDef, type StructuredOutputDataType } from './StructuredOutputField'

export interface StructuredOutputConfig {
  schema?: {
    type: 'OBJECT'
    properties: StructuredOutputFieldDef[]
  }
  messageField: string
  explanationField: string
  descriptionOnly: boolean
}

const inputClass = 'w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-neutral-500'
const labelClass = 'text-sm font-medium text-neutral-400'

export function StructuredOutputSchema({ config, disabled, onUpdate }: {
  config: StructuredOutputConfig
  disabled?: boolean
  onUpdate: (updated: StructuredOutputConfig) => void
}) {
  const properties = config.schema?.properties ?? []

  const updateProperties = (properties: StructuredOutputFieldDef[]) => {
    onUpdate({
      ...config,
      schema: { type: 'OBJECT', properties },
    })
  }

  const addField = () => {
    updateProperties([
      ...properties,
      { name: '', schema: { type: 'STRING' as StructuredOutputDataType, description: '' } },
    ])
  }

  const updateName = (index: number, name: string) => {
    const oldName = properties[index].name
    const updated = properties.map((f, i) => i === index ? { ...f, name } : f)
    const updates: Partial<StructuredOutputConfig> = { schema: { type: 'OBJECT', properties: updated } }

    if (oldName !== '') {
      if (config.messageField === oldName) updates.messageField = name
      if (config.explanationField === oldName) updates.explanationField = name
    }

    onUpdate({ ...config, ...updates })
  }

  const updateType = (index: number, type: StructuredOutputDataType) => {
    updateProperties(properties.map((f, i) =>
      i === index ? { ...f, schema: { ...f.schema, type } } : f
    ))
  }

  const updateDescription = (index: number, description: string) => {
    updateProperties(properties.map((f, i) =>
      i === index ? { ...f, schema: { ...f.schema, description } } : f
    ))
  }

  const deleteField = (index: number) => {
    const deletedName = properties[index].name
    const updated = properties.filter((_, i) => i !== index)
    const updates: Partial<StructuredOutputConfig> = { schema: { type: 'OBJECT', properties: updated } }

    if (config.messageField === deletedName) updates.messageField = ''
    if (config.explanationField === deletedName) updates.explanationField = ''

    onUpdate({ ...config, ...updates })
  }

  return (
    <div className="space-y-4">

      {/* Schema fields */}
      <div className="rounded-lg border border-neutral-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-900/60">
          <h3 className="text-md font-semibold text-neutral-300">Response Output Fields</h3>
          <p className="text-sm text-neutral-500 mt-0.5">Edit the descriptions of the public assistant output fields.</p>
        </div>
        <div className="p-4 space-y-3 bg-neutral-900/20">
          {properties.map((field, i) => (
            <StructuredOutputField
              key={i}
              field={field}
              fieldIndex={i}
              disabled={disabled}
              descriptionOnly={config.descriptionOnly}
              onUpdateName={updateName}
              onUpdateType={updateType}
              onUpdateDescription={updateDescription}
              onDelete={deleteField}
            />
          ))}
          {!config.descriptionOnly &&
            <button
              onClick={addField}
              disabled={disabled || config.descriptionOnly}
              className="flex items-center gap-1.5 rounded-md border border-dashed border-neutral-600 text-sm text-neutral-400 hover:border-neutral-400 hover:text-neutral-200 transition-colors px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <span className="text-base leading-none">+</span> Add field
            </button>
          }
        </div>
      </div>

      {/* Field mappings */}
      {!config.descriptionOnly && <div className="space-y-3">
        <div className="space-y-1.5">
          <label className={labelClass}>JSON field for chat message</label>
          <input
            type="text"
            value={config.messageField}
            disabled={disabled}
            onChange={e => onUpdate({ ...config, messageField: e.target.value })}
            placeholder="JSON field to extract chat message from"
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>JSON field for explanation / chain of thought</label>
          <input
            type="text"
            value={config.explanationField}
            disabled={disabled}
            onChange={e => onUpdate({ ...config, explanationField: e.target.value })}
            placeholder="JSON field to extract explanation from"
            className={inputClass}
          />
        </div>
      </div>}

    </div>
  )
}
