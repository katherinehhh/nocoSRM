import { useTranslation } from '@nocobase/i18n/client';
import { useState } from 'react';
import { Badge } from '#components/ui/badge';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '#components/ui/tooltip';
export function CoreStatus({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <Badge variant='outline'>
      {t(`core.status.${status}`, { defaultValue: status })}
    </Badge>
  );
}
export function Truncated({ text }: { text: string }) {
  const [overflow, setOverflow] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className='block max-w-xs truncate'
            onFocus={(e) =>
              setOverflow(
                e.currentTarget.scrollWidth > e.currentTarget.clientWidth,
              )
            }
            tabIndex={0}
            onMouseEnter={(e) =>
              setOverflow(
                e.currentTarget.scrollWidth > e.currentTarget.clientWidth,
              )
            }
          />
        }
      >
        {text}
      </TooltipTrigger>
      {overflow && <TooltipContent>{text}</TooltipContent>}
    </Tooltip>
  );
}
