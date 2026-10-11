import { useState } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { zhCN, enUS } from 'date-fns/locale';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from './ui/button.js';
import { Calendar } from './ui/calendar.js';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover.js';
export function DatePicker({
  value,
  onChange,
  label,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { i18n } = useTranslation();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type='button'
            variant='outline'
            disabled={disabled}
            className='w-full justify-start font-normal'
            aria-label={label}
          />
        }
      >
        <CalendarIcon className='size-4' />
        {value || label}
      </PopoverTrigger>
      <PopoverContent className='w-auto p-0'>
        <Calendar
          mode='single'
          locale={i18n.language.startsWith('zh') ? zhCN : enUS}
          selected={value ? new Date(`${value}T12:00:00`) : undefined}
          onSelect={(date) => {
            if (date) onChange(format(date, 'yyyy-MM-dd'));
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
