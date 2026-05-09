type FormFieldProps = {
  id: string;
  label: string;
  children: React.ReactNode;
  helperText?: string;
  required?: boolean;
};

export function FormField({ id, label, children, helperText, required = false }: FormFieldProps) {
  const helperId = helperText ? `${id}-helper` : undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-slate-100">
        {label}
        {required ? <span className="ml-1 text-cyan-200">*</span> : null}
      </label>
      <div className="mt-2">{children}</div>
      {helperText ? (
        <p id={helperId} className="mt-2 text-xs leading-5 text-slate-500">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
