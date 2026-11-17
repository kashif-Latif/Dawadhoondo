import { NavLink, Route, Routes } from 'react-router-dom';
import Logo from './components/Logo';
import Home from './pages/Home';
import Find from './pages/Find';
import Pharmacy from './pages/Pharmacy';
import Insights from './pages/Insights';
import { configured } from './lib/supabase';
import { Notice } from './components/Bits';

const nav = ({ isActive }) =>
  `rounded-full px-3.5 py-2 text-sm font-semibold transition ${isActive ? 'bg-ink text-cream' : 'text-ink/70 hover:bg-paper'}`;

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-[1100] border-b border-line/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={nav}>Find</NavLink>
            <NavLink to="/pharmacy" className={nav}><span className="sm:hidden">Pharmacy</span><span className="hidden sm:inline">For pharmacies</span></NavLink>
            <NavLink to="/insights" className={`${nav({ isActive: false })} hidden sm:inline-flex`}>Shortages</NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-10">
        {!configured && (
          <div className="mb-6">
            <Notice tone="error">Setup needed: add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.</Notice>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/find" element={<Find />} />
          <Route path="/pharmacy" element={<Pharmacy />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>

      <footer className="border-t border-line/70 py-6 text-center text-xs text-muted">
        <p>Stock is updated by pharmacies. Please call to confirm before you travel.</p>
        <p className="mt-1">DawaDhoondo helps you find medicines. It does not give medical advice. Pharmacy map data © OpenStreetMap contributors.</p>
      </footer>
    </div>
  );
}
