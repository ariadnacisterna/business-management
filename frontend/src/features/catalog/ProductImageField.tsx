import { useEffect, useRef, useState } from 'react'
import { removeProductImage, uploadProductImage } from '../../api/catalog'
import { ApiError } from '../../api/client'
import type { Product } from '../../api/types'
import { ConfirmDialog } from '../../shared/ConfirmDialog'
import { TrashIcon } from '../../shared/icons'
import { useToast } from '../../shared/Toast'

const UPLOAD_ERROR_MESSAGE = 'No se pudo subir la imagen. Intentá de nuevo.'
const REMOVE_ERROR_MESSAGE = 'No se pudo quitar la imagen. Intentá de nuevo.'
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp'

function UploadCloudIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <path d="M7 18a4.5 4.5 0 0 1-1-8.9A5 5 0 0 1 16.2 7.3 4 4 0 0 1 17 15.4" />
      <path d="M12 12v7" />
      <path d="M9.5 14.5 12 12l2.5 2.5" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

function ImagePlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
      <path d="M16 3.5v5" />
      <path d="M13.5 6h5" />
    </svg>
  )
}

interface NewProductImagePickerProps {
  file: File | null
  disabled?: boolean
  onChange: (file: File | null) => void
}

export function NewProductImagePicker({ file, disabled = false, onChange }: NewProductImagePickerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (file === null) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    if (disabled) return
    const dropped = event.dataTransfer.files?.[0] ?? null
    if (dropped !== null) onChange(dropped)
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-base font-bold uppercase tracking-wide opacity-60">
        Imagen <span className="font-normal normal-case opacity-70">(opcional)</span>
      </span>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        aria-label="Elegir imagen del producto"
        onChange={(event) => {
          onChange(event.target.files?.[0] ?? null)
          event.target.value = ''
        }}
        disabled={disabled}
        className="hidden"
      />

      {file === null ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click()
          }}
          onDragOver={(event) => {
            event.preventDefault()
            if (!disabled) setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-3.5 transition-colors ${
            dragActive ? 'border-brand bg-surface-brand' : 'border-line hover:bg-surface-brand/60'
          } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <ImagePlusIcon />
          </span>
          <div>
            <p className="m-0 text-base font-bold">Agregar imagen</p>
            <p className="m-0 mt-0.5 text-sm opacity-60">JPG, PNG o WEBP · hasta 5 MB</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-line p-3.5">
          {previewUrl !== null && (
            <img
              src={previewUrl}
              alt=""
              className="h-11 w-11 shrink-0 rounded-lg border border-line object-cover"
            />
          )}
          <p className="m-0 flex-1 truncate text-base">{file.name}</p>
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
          >
            <TrashIcon />
            Quitar
          </button>
        </div>
      )}
    </div>
  )
}

interface StagedProductImageFieldProps {
  imageUrl: string | null
  productName: string
  pendingFile: File | null
  removed: boolean
  disabled?: boolean
  onSelectFile: (file: File) => void
  onRemove: () => void
  onUndo: () => void
}

export function StagedProductImageField({
  imageUrl,
  productName,
  pendingFile,
  removed,
  disabled = false,
  onSelectFile,
  onRemove,
  onUndo,
}: StagedProductImageFieldProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (pendingFile === null) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(pendingFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingFile])

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    if (disabled) return
    const dropped = event.dataTransfer.files?.[0] ?? null
    if (dropped !== null) onSelectFile(dropped)
  }

  const showsExistingOrPending = pendingFile !== null || (imageUrl !== null && !removed)

  return (
    <div className="flex flex-col gap-2">
      <span className="text-base font-bold uppercase tracking-wide opacity-60">
        Imagen <span className="font-normal normal-case opacity-70">(opcional)</span>
      </span>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        aria-label="Elegir imagen del producto"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null
          if (file !== null) onSelectFile(file)
          event.target.value = ''
        }}
        disabled={disabled}
        className="hidden"
      />

      {!showsExistingOrPending ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click()
          }}
          onDragOver={(event) => {
            event.preventDefault()
            if (!disabled) setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed p-4 transition-colors ${
            dragActive ? 'border-brand bg-surface-brand' : 'border-line hover:bg-surface-brand/60'
          } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <UploadCloudIcon />
          </span>
          <div>
            <p className="m-0 text-lg font-bold">
              {removed ? 'La imagen se va a quitar al guardar' : 'Arrastrá una imagen o hacé clic'}
            </p>
            <p className="m-0 mt-0.5 text-base opacity-60">
              {removed ? 'Podés deshacerlo o elegir una imagen nueva.' : 'JPG, PNG o WEBP · hasta 5 MB'}
            </p>
          </div>
          {removed && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onUndo()
              }}
              disabled={disabled}
              className="ml-auto flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-base transition-colors hover:bg-surface-brand disabled:opacity-40"
            >
              <RefreshIcon />
              Deshacer
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-line p-4 lg:items-start lg:gap-4">
          <img
            src={pendingFile !== null ? (previewUrl ?? undefined) : (imageUrl ?? undefined)}
            alt={productName}
            className="h-16 w-16 shrink-0 rounded-lg border border-line object-cover lg:h-24 lg:w-24"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2 lg:h-24 lg:justify-between">
            <div className="min-w-0">
              <p className="m-0 truncate text-base font-bold lg:text-lg">
                {pendingFile !== null ? pendingFile.name : 'Imagen del producto'}
              </p>
              <p className="m-0 mt-0.5 text-sm opacity-60 lg:text-base">
                {pendingFile !== null ? 'Se va a guardar cuando confirmes los cambios.' : 'Podés cambiarla o quitarla.'}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-base transition-colors hover:bg-surface-brand disabled:opacity-40"
              >
                <RefreshIcon />
                Cambiar
              </button>
              <button
                type="button"
                onClick={pendingFile !== null ? onUndo : onRemove}
                disabled={disabled}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-base text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
              >
                <TrashIcon />
                Quitar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface Props {
  product: Product
  disabled?: boolean
  onUpdated: (product: Product) => void
}

export function ProductImageField({ product, disabled = false, onUpdated }: Props) {
  const { showError } = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  function selectFile(file: File | null) {
    if (file !== null) {
      setPendingFile(file)
    }
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0] ?? null)
    event.target.value = ''
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    if (disabled || saving) return
    selectFile(event.dataTransfer.files?.[0] ?? null)
  }

  async function confirmUpload() {
    if (pendingFile === null) return
    setSaving(true)
    try {
      const updated = await uploadProductImage(product.id, pendingFile)
      onUpdated(updated)
      setPendingFile(null)
    } catch (err) {
      showError(err instanceof ApiError ? err.message : UPLOAD_ERROR_MESSAGE)
    } finally {
      setSaving(false)
    }
  }

  async function confirmRemove() {
    setConfirmingRemove(false)
    setSaving(true)
    try {
      const updated = await removeProductImage(product.id)
      onUpdated(updated)
    } catch (err) {
      showError(err instanceof ApiError ? err.message : REMOVE_ERROR_MESSAGE)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-base font-bold uppercase tracking-wide opacity-60">Imagen</span>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        aria-label="Elegir imagen del producto"
        onChange={handleFileSelected}
        disabled={disabled || saving}
        className="hidden"
      />

      {product.image_url === null ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click()
          }}
          onDragOver={(event) => {
            event.preventDefault()
            if (!disabled && !saving) setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed p-4 transition-colors ${
            dragActive ? 'border-brand bg-surface-brand' : 'border-line hover:bg-surface-brand/60'
          } ${disabled || saving ? 'pointer-events-none opacity-50' : ''}`}
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <UploadCloudIcon />
          </span>
          <div>
            <p className="m-0 text-lg font-bold">Arrastrá una imagen o hacé clic</p>
            <p className="m-0 mt-0.5 text-base opacity-60">JPG, PNG o WEBP · hasta 5 MB</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 rounded-xl border border-line p-4">
          <img
            src={product.image_url}
            alt={product.name}
            className="h-14 w-14 shrink-0 rounded-lg border border-line object-cover"
          />
          <div className="flex-1">
            <p className="m-0 text-lg font-bold">Imagen del producto</p>
            <p className="m-0 mt-0.5 text-base opacity-60">Podés cambiarla o quitarla.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || saving}
              className="flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-base transition-colors hover:bg-surface-brand disabled:opacity-40"
            >
              <RefreshIcon />
              Cambiar
            </button>
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              disabled={disabled || saving}
              className="flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-base text-danger transition-colors hover:bg-danger/10 disabled:opacity-40"
            >
              <TrashIcon />
              Quitar
            </button>
          </div>
        </div>
      )}

      {pendingFile !== null && (
        <ConfirmDialog
          title="Cambiar imagen"
          description={`Se va a subir "${pendingFile.name}" como imagen de "${product.name}".`}
          confirmLabel="Subir"
          onConfirm={confirmUpload}
          onCancel={() => setPendingFile(null)}
        />
      )}

      {confirmingRemove && (
        <ConfirmDialog
          title="Quitar imagen"
          description={`Se va a quitar la imagen de "${product.name}".`}
          confirmLabel="Quitar"
          danger
          onConfirm={confirmRemove}
          onCancel={() => setConfirmingRemove(false)}
        />
      )}
    </div>
  )
}
