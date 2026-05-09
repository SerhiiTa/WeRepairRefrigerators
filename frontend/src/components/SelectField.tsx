type SelectFieldProps = {
  id: string;
  name: string;
  options: string[];
  required?: boolean;
};

export function SelectField({ id, name, options, required = false }: SelectFieldProps) {
  return (
    <select
      id={id}
      name={name}
      required={required}
      className="w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-300"
      defaultValue=""
    >
      <option value="" disabled>
        Select one
      </option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
