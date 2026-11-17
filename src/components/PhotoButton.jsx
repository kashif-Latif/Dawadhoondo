import { useRef } from 'react';
import { compressImage } from '../lib/image';
import { CameraIcon } from './Icons';

export default function PhotoButton({ onImage, onError, children, className = 'btn-soft', disabled }) {
  const ref = useRef();
  const change = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { onImage(await compressImage(file)); } catch (err) { onError?.(err.message); }
  };
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current.click()} disabled={disabled}>
        <CameraIcon /> {children}
      </button>
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={change} />
    </>
  );
}
