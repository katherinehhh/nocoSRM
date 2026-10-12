import { useState } from 'react';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '#components/ui/card';
import { Input } from '#components/ui/input';
import { Field, FieldLabel } from '#components/ui/field';
import { Textarea } from '#components/ui/textarea';
import { Button } from '#components/ui/button';
import { NativeSelect, NativeSelectOption } from '#components/ui/native-select';
import { Link } from 'react-router';
import { State } from './states.js';
import { useCopy, useShowcase, useWrite, type Overview } from './common.js';
import { Spinner } from '#components/ui/spinner';
export default function Assistant() {
  const { t } = useCopy(),
    q = useShowcase<{ data: Overview }>('overview'),
    write = useWrite(),
    extract = useWrite(),
    [text, setText] = useState(''),
    [employee, setEmployee] = useState('showcase.delivery'),
    [result, setResult] = useState(''),
    [fileError, setFileError] = useState('');
  return (
    <PageContainer>
      <PageHeader
        title={t('showcase.ai')}
        description={t('showcase.employeeDescriptions.delivery')}
      />
      <State
        loading={q.isPending}
        error={q.error}
        retry={() => void q.refetch()}
      />
      {q.data && (
        <Card>
          <CardHeader>
            <CardTitle>{t('showcase.modelMode')}</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <p>
              {t(
                q.data.data.modelReady
                  ? 'showcase.modelReady'
                  : 'showcase.modelUnconfigured',
              )}
            </p>
            {q.data.data.modelManage && (
              <Button
                nativeButton={false}
                variant='outline'
                render={<Link to='/model-services' />}
              >
                {t('showcase.models')}
              </Button>
            )}
            {q.data.data.actions.includes('assistant') ? (
              <form
                className='flex flex-col gap-4'
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!text.trim() || !q.data?.data.modelReady) return;
                  write.mutate(
                    {
                      path: 'showcase/assistant/analyze',
                      json: { text, mode: 'model', employee },
                    },
                    {
                      onSuccess: (r) =>
                        setResult(
                          String((r.data as { text?: string }).text ?? ''),
                        ),
                    },
                  );
                }}
              >
                <NativeSelect
                  aria-label={t('showcase.employee')}
                  value={employee}
                  onChange={(e) => setEmployee(e.target.value)}
                >
                  {['delivery', 'approval', 'ledger'].map((key) => (
                    <NativeSelectOption key={key} value={`showcase.${key}`}>
                      {t(`showcase.employees.${key}`)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Field>
                  <FieldLabel htmlFor='assistant-file'>
                    {t('showcase.uploadText')}
                  </FieldLabel>
                  <Input
                    id='assistant-file'
                    type='file'
                    accept='.pdf,.txt,.csv,.json,.md'
                    disabled={write.isPending || extract.isPending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setFileError('');
                      if (file.name.toLowerCase().endsWith('.pdf')) {
                        if (file.size > 2 * 1024 * 1024) {
                          setFileError(t('srm.invalidDocument'));
                          return;
                        }
                        void file
                          .arrayBuffer()
                          .then((buffer) => {
                            const bytes = new Uint8Array(buffer);
                            let binary = '';
                            for (const byte of bytes)
                              binary += String.fromCharCode(byte);
                            extract.mutate(
                              {
                                path: 'showcase/assistant/extractPdf',
                                json: { content: btoa(binary) },
                              },
                              {
                                onSuccess: (r) =>
                                  setText(
                                    String((r.data as { text: string }).text),
                                  ),
                              },
                            );
                          })
                          .catch(() => setFileError(t('srm.invalidDocument')));
                      } else if (file.size > 65536)
                        setFileError(t('srm.invalidDocument'));
                      else
                        void file
                          .text()
                          .then((value) => setText(value.slice(0, 20000)))
                          .catch(() => setFileError(t('srm.invalidDocument')));
                    }}
                  />
                  {fileError && (
                    <p role='alert' className='text-destructive'>
                      {fileError}
                    </p>
                  )}
                </Field>
                <Textarea
                  aria-label={t('showcase.sourceText')}
                  value={text}
                  maxLength={20000}
                  onChange={(e) => setText(e.target.value)}
                  disabled={write.isPending}
                />
                <Button
                  className='self-start'
                  type='submit'
                  disabled={
                    write.isPending ||
                    !q.data.data.modelReady ||
                    !q.data.data.actions.includes('assistant') ||
                    !text.trim()
                  }
                >
                  {write.isPending && <Spinner />}
                  {t('showcase.analyze')}
                </Button>
              </form>
            ) : (
              <p>{t('srm.forbidden')}</p>
            )}
            {result && (
              <p className='whitespace-pre-wrap break-words'>{result}</p>
            )}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
