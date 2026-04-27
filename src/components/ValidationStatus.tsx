import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { AgentCardValidation } from '../utils/agentCardValidation'

type Props = {
  validation: AgentCardValidation
}

export function ValidationStatus({ validation }: Props) {
  if (validation.valid) {
    return (
      <div className="validation validation-valid">
        <CheckCircle2 size={18} />
        <span>Valid A2A 0.3.0 card</span>
      </div>
    )
  }

  return (
    <div className="validation validation-invalid">
      <div className="validation-title">
        <AlertCircle size={18} />
        <span>Invalid A2A 0.3.0 card</span>
      </div>
      <ul>
        {validation.missing.map((field) => (
          <li key={field}>Missing: {field}</li>
        ))}
      </ul>
    </div>
  )
}
