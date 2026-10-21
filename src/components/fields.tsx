import {
  ComboBox,
  Description,
  FieldError,
  Input,
  Label,
  ListBox,
  NumberField,
  Select,
  Switch,
  TextArea,
  TextField,
  type Key,
} from "@heroui/react";
import type { ReactNode } from "react";

interface BaseProps {
  label?: string;
  description?: ReactNode;
  errorMessage?: string;
  isRequired?: boolean;
  isDisabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  autoFocus,
  ...base
}: BaseProps & {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "tel" | "date" | "search" | "url";
  autoFocus?: boolean;
}) {
  return (
    <TextField
      value={value}
      onChange={onChange}
      isRequired={base.isRequired}
      isDisabled={base.isDisabled}
      isInvalid={!!base.errorMessage}
      className={base.className}
      aria-label={base["aria-label"] ?? (base.label ? undefined : placeholder)}
      autoFocus={autoFocus}
      fullWidth
    >
      {base.label && <Label>{base.label}</Label>}
      <Input type={type} placeholder={placeholder} />
      {base.description && <Description>{base.description}</Description>}
      <FieldError>{base.errorMessage}</FieldError>
    </TextField>
  );
}

export function DateInput(props: BaseProps & { value: string; onChange: (v: string) => void; min?: string }) {
  return <TextInput {...props} type="date" />;
}

export function TextAreaInput({
  value,
  onChange,
  placeholder,
  rows = 3,
  ...base
}: BaseProps & { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <TextField
      value={value}
      onChange={onChange}
      isDisabled={base.isDisabled}
      className={base.className}
      aria-label={base["aria-label"]}
      fullWidth
    >
      {base.label && <Label>{base.label}</Label>}
      <TextArea placeholder={placeholder} rows={rows} />
      {base.description && <Description>{base.description}</Description>}
    </TextField>
  );
}

export function NumberInput({
  value,
  onChange,
  minValue = 0,
  maxValue,
  step,
  suffix,
  money,
  maximumFractionDigits = 4,
  ...base
}: BaseProps & {
  value: number;
  onChange: (v: number) => void;
  minValue?: number;
  maxValue?: number;
  step?: number;
  /** Unit shown after the input, e.g. "lembar". */
  suffix?: string;
  /** Formats as Rupiah without decimals. */
  money?: boolean;
  maximumFractionDigits?: number;
}) {
  return (
    <NumberField
      value={Number.isFinite(value) ? value : 0}
      onChange={(v) => onChange(Number.isFinite(v) ? v : 0)}
      minValue={minValue}
      maxValue={maxValue}
      step={step}
      isRequired={base.isRequired}
      isDisabled={base.isDisabled}
      isInvalid={!!base.errorMessage}
      className={base.className}
      aria-label={base["aria-label"]}
      formatOptions={
        money
          ? { style: "currency", currency: "IDR", maximumFractionDigits: 0, currencyDisplay: "narrowSymbol" }
          : { maximumFractionDigits }
      }
      fullWidth
    >
      {base.label && <Label>{base.label}</Label>}
      <NumberField.Group className={suffix ? "grid-cols-[minmax(0,1fr)_auto]" : undefined}>
        <NumberField.Input className="min-w-0" />
        {suffix && <span className="pointer-events-none pr-3 text-sm text-muted whitespace-nowrap">{suffix}</span>}
      </NumberField.Group>
      {base.description && <Description>{base.description}</Description>}
      <FieldError>{base.errorMessage}</FieldError>
    </NumberField>
  );
}

export interface Option {
  id: string;
  label: string;
  description?: string;
}

export function SelectInput({
  value,
  onChange,
  options,
  placeholder = "Pilih…",
  ...base
}: BaseProps & { value: string | null; onChange: (v: string) => void; options: Option[]; placeholder?: string }) {
  return (
    <Select
      value={value}
      onChange={(k: Key | null) => k !== null && onChange(String(k))}
      placeholder={placeholder}
      isRequired={base.isRequired}
      isDisabled={base.isDisabled}
      isInvalid={!!base.errorMessage}
      className={base.className}
      aria-label={base["aria-label"]}
      fullWidth
    >
      {base.label && <Label>{base.label}</Label>}
      <Select.Trigger>
        {/* Show only the label in the trigger; descriptions are for the list. */}
        <Select.Value>{({ isPlaceholder, defaultChildren, selectedText }) => (isPlaceholder ? defaultChildren : selectedText)}</Select.Value>
        <Select.Indicator />
      </Select.Trigger>
      {base.description && <Description>{base.description}</Description>}
      <FieldError>{base.errorMessage}</FieldError>
      <Select.Popover>
        <ListBox items={options}>
          {(o) => (
            <ListBox.Item id={o.id} textValue={o.label}>
              <div className="flex flex-col">
                <span>{o.label}</span>
                {o.description && <span className="text-xs text-muted">{o.description}</span>}
              </div>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          )}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

/** Searchable picker for long lists (items, partners). */
export function SearchPicker({
  value,
  onChange,
  options,
  placeholder = "Cari…",
  emptyText = "Tidak ditemukan",
  ...base
}: BaseProps & {
  value: string | null;
  onChange: (v: string | null) => void;
  options: Option[];
  placeholder?: string;
  emptyText?: string;
}) {
  return (
    <ComboBox
      value={value}
      onChange={(k: Key | null) => onChange(k === null ? null : String(k))}
      isRequired={base.isRequired}
      isDisabled={base.isDisabled}
      isInvalid={!!base.errorMessage}
      className={base.className}
      aria-label={base["aria-label"]}
      defaultItems={options}
      menuTrigger="focus"
      fullWidth
    >
      {base.label && <Label>{base.label}</Label>}
      <ComboBox.InputGroup>
        <Input placeholder={placeholder} />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      {base.description && <Description>{base.description}</Description>}
      <FieldError>{base.errorMessage}</FieldError>
      <ComboBox.Popover>
        <ListBox renderEmptyState={() => <div className="p-3 text-sm text-muted">{emptyText}</div>}>
          {(o: Option) => (
            <ListBox.Item id={o.id} textValue={o.label}>
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{o.label}</span>
                {o.description && <span className="truncate text-xs text-muted">{o.description}</span>}
              </div>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          )}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}

export function SwitchInput({
  isSelected,
  onChange,
  label,
  description,
  isDisabled,
}: {
  isSelected: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  isDisabled?: boolean;
}) {
  return (
    <Switch isSelected={isSelected} onChange={onChange} isDisabled={isDisabled}>
      <Switch.Content className="items-start">
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <span className="flex flex-col">
          <Label>{label}</Label>
          {description && <span className="text-xs text-muted">{description}</span>}
        </span>
      </Switch.Content>
    </Switch>
  );
}
