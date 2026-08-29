export type CampaignFieldType = 'text' | 'textarea' | 'select' | 'radio' | 'checkbox' | 'email' | 'tel' | 'date'

export interface CampaignSourceField {
  name?: string
  label: string
  type?: CampaignFieldType
  required?: boolean
  placeholder?: string
  options?: string[]
}

export interface CampaignDraftField {
  id: string
  label: string
  type: CampaignFieldType
  required: boolean
  placeholder: string
  optionsText: string
}

export interface FormLinkAccount {
  channelId: string
  liffId?: string | null
}

export function copyFieldsToCampaignDraft(
  fields: CampaignSourceField[],
  createId: () => string,
): CampaignDraftField[] {
  return fields.map((field) => ({
    id: createId(),
    label: field.label,
    type: field.type ?? 'text',
    required: Boolean(field.required),
    placeholder: field.placeholder ?? '',
    optionsText: (field.options ?? []).join('\n'),
  }))
}

export function buildAccountFormLinks(input: {
  workerBase: string
  account: FormLinkAccount
  formId: string
  refCode: string
}): { campaignUrl: string; directFormUrl: string } {
  const workerBase = input.workerBase.replace(/\/$/, '')
  const campaignParams = new URLSearchParams({
    ref: input.refCode,
    form: input.formId,
    account: input.account.channelId,
  })
  const formParams = new URLSearchParams({ page: 'form', id: input.formId })
  if (input.account.liffId) formParams.set('liffId', input.account.liffId)

  return {
    campaignUrl: `${workerBase}/auth/line?${campaignParams.toString()}`,
    directFormUrl: input.account.liffId
      ? `https://liff.line.me/${input.account.liffId}?${formParams.toString()}`
      : `${workerBase}?${formParams.toString()}`,
  }
}
