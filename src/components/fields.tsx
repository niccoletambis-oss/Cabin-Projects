export function Field({
  label,
  name,
  value = "",
  type = "text",
  required = false,
  options,
}: {
  label: string;
  name: string;
  value?: string | number;
  type?: string;
  required?: boolean;
  options?: string[] | { id: string; name: string }[];
}) {
  return (
    <label>
      {label}
      {options ? (
        <select name={name} defaultValue={String(value)} required={required}>
          {options.map((option) =>
            typeof option === "string" ? (
              <option key={option} value={option}>
                {option.replaceAll("_", " ")}
              </option>
            ) : (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ),
          )}
        </select>
      ) : type === "textarea" ? (
        <textarea
          name={name}
          defaultValue={value}
          maxLength={2000}
          required={required}
        />
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={value}
          required={required}
          min={type === "number" ? 0 : undefined}
          step={type === "number" ? "any" : undefined}
          maxLength={type === "password" ? 128 : 2000}
        />
      )}
    </label>
  );
}
export function Hidden({ name, value }: { name: string; value: string }) {
  return <input type="hidden" name={name} value={value} />;
}
