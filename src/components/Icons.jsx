const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const I = (d) => function Icon({ className = 'size-5' }) {
  return <svg viewBox="0 0 24 24" className={className} {...base} aria-hidden="true">{d}</svg>;
};

export const SearchIcon = I(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const CameraIcon = I(<><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>);
export const MicIcon = I(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>);
export const PinIcon = I(<><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" /></>);
export const PhoneIcon = I(<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />);
export const ArrowIcon = I(<path d="M5 12h14M13 6l6 6-6 6" />);
export const XIcon = I(<path d="M6 6l12 12M18 6 6 18" />);
export const CheckIcon = I(<path d="m5 12 5 5 9-10" />);
export const StoreIcon = I(<><path d="M4 10v10h16V10M3 10l2-6h14l2 6z" /><path d="M10 20v-5h4v5" /></>);
export const RouteIcon = I(<><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7" /></>);
export const PlusIcon = I(<path d="M12 5v14M5 12h14" />);
export const MinusIcon = I(<path d="M5 12h14" />);
export const ChartIcon = I(<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />);
export const ShieldIcon = I(<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" />);
