import { useEffect, useMemo, useRef, useState } from "react";
import type { StationOption } from "./Board";

/**
 * Searchable station picker for the Daylight board's Från/Till fields — a text
 * input that filters the station list to suggestions matching what the user
 * types (replacing the plain native <select>). Selecting a suggestion sets the
 * underlying stop id; clearing the box resets to "all stations". Keyboard:
 * ↑/↓ to move, Enter to choose, Esc to revert.
 */
export function StationField({
  label,
  value,
  onChange,
  options,
  placeholder = "Alla stationer",
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  options: StationOption[];
  placeholder?: string;
}) {
  const selectedName = useMemo(
    () => options.find((o) => o.id === value)?.name ?? "",
    [options, value]
  );
  const [text, setText] = useState(selectedName);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Keep the visible text in sync when the value changes from outside (URL
  // params, profile defaults, the other field swapping, …).
  useEffect(() => setText(selectedName), [selectedName]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setText(selectedName); // discard a half-typed query
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [selectedName]);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    const base = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
    return base.slice(0, 8);
  }, [text, options]);

  const choose = (o: StationOption) => {
    onChange(o.id);
    setText(o.name);
    setOpen(false);
  };

  const clear = () => {
    onChange("");
    setText("");
    setOpen(false);
  };

  return (
    <div className="board__control stationfield" ref={ref}>
      <span>{label}</span>
      <input
        type="text"
        value={text}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setActive(0);
          if (!e.target.value) onChange(""); // typing-to-empty clears the filter
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && matches[active]) {
            e.preventDefault();
            choose(matches[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
            setText(selectedName);
          }
        }}
      />
      {open && matches.length > 0 && (
        <ul className="stationfield__menu" role="listbox">
          {value && (
            <li
              className="stationfield__opt stationfield__clear"
              onMouseDown={(e) => {
                e.preventDefault();
                clear();
              }}
            >
              Alla stationer
            </li>
          )}
          {matches.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={i === active}
              className={"stationfield__opt" + (i === active ? " is-active" : "")}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
            >
              {o.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
