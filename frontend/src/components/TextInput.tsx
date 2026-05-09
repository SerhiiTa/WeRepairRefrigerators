type TextInputProps = {
  id: string;
  name: string;
  placeholder?: string;
  type?: "text" | "number" | "tel";
  required?: boolean;
  inputMode?: "decimal" | "numeric" | "search" | "tel" | "text";
};

export function TextInput({
  id,
  name,
  placeholder,
  type = "text",
  required = false,
  inputMode,
}: TextInputProps) {
  return (
    <input
      id={id}
      name={name}
      type={type}
      required={required}
      inputMode={inputMode}
      placeholder={placeholder}
      className="w-full rounded-md border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300"
    />
  );
}
