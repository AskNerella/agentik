import type { AgentCard } from '../types/a2a'

export type AgentCardValidation = {
  valid: boolean
  missing: string[]
}

export function validateAgentCard(card: Partial<AgentCard> | null): AgentCardValidation {
  if (!card) {
    return {
      valid: false,
      missing: ['name', 'url', 'skills'],
    }
  }

  const missing: string[] = []

  if (!card.name || typeof card.name !== 'string') {
    missing.push('name')
  }

  if (!card.description || typeof card.description !== 'string') {
    missing.push('description')
  }

  if (!card.url || typeof card.url !== 'string') {
    missing.push('url')
  }

  if (!Array.isArray(card.skills) || card.skills.length === 0) {
    missing.push('skills')
  } else {
    card.skills.forEach((skill, index) => {
      if (!skill || typeof skill !== 'object') {
        missing.push(`skills[${index}]`)
        return
      }

      if (!skill.name || typeof skill.name !== 'string') {
        missing.push(`skills[${index}].name`)
      }

      if (!skill.description || typeof skill.description !== 'string') {
        missing.push(`skills[${index}].description`)
      }
    })
  }

  return {
    valid: missing.length === 0,
    missing,
  }
}
