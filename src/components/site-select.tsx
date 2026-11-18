'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { FiCheck, FiChevronDown, FiSearch } from 'react-icons/fi';
import styles from './site-select.module.css';

type Option = { value: string; label: string; strong?: boolean };

export function SiteSelect({ label, value, options, onChange, placeholder = 'Select an option', disabled = false, name, required = false }: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
  required?: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const filtered = options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()));
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div className={styles.root} ref={root} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <label id={id + '-label'} htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      {name && <input type="hidden" name={name} value={value} />}
      <button ref={trigger} id={id} type="button" className={styles.trigger} disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id + '-options' : undefined}
        onClick={() => { setQuery(''); setActive(0); setOpen(!open); }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setQuery(''); setActive(0); setOpen(true);
          }
        }}>
        <span className={!selected ? styles.placeholder : undefined}>{selected?.strong ? <strong>{selected.label}</strong> : selected?.label ?? placeholder}</span>
        <FiChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className={styles.menu}>
          <div className={styles.search}>
            <FiSearch aria-hidden="true" />
            <input ref={search} role="combobox" aria-label={'Search ' + label.toLowerCase()} aria-expanded="true"
              aria-controls={id + '-options'} aria-autocomplete="list"
              aria-activedescendant={filtered[active] ? id + '-option-' + active : undefined}
              value={query} placeholder="Search…" onChange={(event) => { setQuery(event.target.value); setActive(0); }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  const next = Math.max(0, Math.min(filtered.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)));
                  setActive(next);
                  document.getElementById(id + '-option-' + next)?.scrollIntoView({ block: 'nearest' });
                }
                if (event.key === 'Enter') { event.preventDefault(); if (filtered[active]) choose(filtered[active].value); }
              }} />
          </div>
          <ul id={id + '-options'} role="listbox" aria-labelledby={id + '-label'}>
            {filtered.map((option, index) => (
              <li id={id + '-option-' + index} key={option.value} role="option" aria-selected={value === option.value}
                data-active={active === index || undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option.value)}>
                <span>{option.strong ? <strong>{option.label}</strong> : option.label}</span>{value === option.value && <FiCheck aria-hidden="true" />}
              </li>
            ))}
          </ul>
          {!filtered.length && <p className={styles.empty}>No matching options.</p>}
        </div>
      )}
    </div>
  );
}
