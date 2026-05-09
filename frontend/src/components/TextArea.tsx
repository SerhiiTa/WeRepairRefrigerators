type TextAreaProps = {
  id: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  rows?: number;
};

export function TextArea({ id, name, placeholder, required = false, rows = 4 }: TextAreaProps) {
  return (
    <textarea
      id={id}
      name={name}
      required={required}
      rows={rows}
      placeholder={placeholder}
      className="w-full resize-y rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300"
    />
  );
}
