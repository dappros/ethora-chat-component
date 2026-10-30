import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactCrop, { centerCrop, convertToPixelCrop, makeAspectCrop, type Crop } from 'react-image-crop';
import cropStyles from 'react-image-crop/dist/ReactCrop.css?inline';
import styled from 'styled-components';
import { useModalDismiss, FOCUSABLE_SELECTOR } from '../../hooks/useModalDismiss';
import { useT } from '../../i18n/useT';

const Backdrop = styled.div`
  position: fixed; inset: 0; z-index: 2147483647;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, .55); padding: 16px;
`;
const Panel = styled.div`
  box-sizing: border-box; width: min(100%, 640px); max-height: 100%; overflow: auto;
  background: var(--ethora-color-bg, #fff); color: var(--ethora-color-text, #171717);
  border-radius: 16px; padding: 20px;
  h2 { margin: 0 0 16px; font-size: 18px; }
  .crop-image { display: flex; justify-content: center; }
  .crop-image img { display: block; max-width: 100%; max-height: 60vh; }
  .crop-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 16px; }
  button { font: inherit; cursor: pointer; padding: 8px 16px; border-radius: 8px; }
`;

interface Props { file: File; onCancel: () => void; onSave: (file: File) => void }

export function AvatarCropDialog({ file, onCancel, onSave }: Props) {
  const t = useT();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const mounted = useRef(true);
  const [url, setUrl] = useState('');
  const [crop, setCrop] = useState<Crop>();
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  useModalDismiss({ onClose: onCancel, containerRef: panelRef });
  useEffect(() => {
    mounted.current = true;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => { mounted.current = false; URL.revokeObjectURL(objectUrl); };
  }, [file]);

  const save = () => {
    const image = imageRef.current;
    if (!image || !crop || !crop.width || !crop.height) return;
    const selected = convertToPixelCrop(crop, image.width, image.height);
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(selected.width * scaleX));
    canvas.height = Math.max(1, Math.round(selected.height * scaleY));
    const ctx = canvas.getContext('2d');
    if (!ctx) { setError(true); return; }
    ctx.drawImage(image, selected.x * scaleX, selected.y * scaleY,
      selected.width * scaleX, selected.height * scaleY, 0, 0, canvas.width, canvas.height);
    setSaving(true);
    canvas.toBlob((blob) => {
      if (!mounted.current) return;
      setSaving(false);
      if (!blob) { setError(true); return; }
      onSave(new File([blob], 'avatar.png', { type: 'image/png' }));
    }, 'image/png');
  };

  return createPortal(
    <Backdrop onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <style>{cropStyles}</style>
      <Panel ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const controls = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
          if (!controls.length) return;
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }}>
        <h2 id={titleId}>{t('avatar.cropTitle')}</h2>
        <div className="crop-image">
          {url && <ReactCrop crop={crop} aspect={1} circularCrop keepSelection onChange={(_, percent) => setCrop(percent)}>
            <img ref={imageRef} src={url} alt={t('avatar.cropTitle')}
              onError={() => setError(true)}
              onLoad={(event) => {
                const { width, height } = event.currentTarget;
                setCrop(centerCrop(makeAspectCrop({ unit: '%', width: 100 }, 1, width, height), width, height));
              }} />
          </ReactCrop>}
        </div>
        {error && <p role="alert">{t('avatar.cropError')}</p>}
        <div className="crop-actions">
          <button type="button" onClick={onCancel}>{t('action.cancel')}</button>
          <button type="button" disabled={!crop || error || saving} onClick={save}>{t('action.save')}</button>
        </div>
      </Panel>
    </Backdrop>, document.body
  );
}
