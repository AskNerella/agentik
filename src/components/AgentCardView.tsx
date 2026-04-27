import { Bot, RefreshCw, Sparkles } from 'lucide-react'
import type { AgentCard } from '../types/a2a'
import type { AgentCardValidation } from '../utils/agentCardValidation'
import { ValidationStatus } from './ValidationStatus'

type Props = {
  card: AgentCard | null
  validation: AgentCardValidation
  loading: boolean
  error: string | null
  onFetch: () => void
}

export function AgentCardView({ card, validation, loading, error, onFetch }: Props) {
  return (
    <section className="agent-section panel-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Agent card</span>
          <h2>{card?.name || 'No agent loaded'}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onFetch} disabled={loading} aria-label="Fetch agent card">
          <RefreshCw size={17} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {error ? <div className="inline-error">{error}</div> : null}

      {card ? (
        <div className="agent-card-content">
          <p>{card.description || 'This agent card does not include a description.'}</p>
          <ValidationStatus validation={validation} />
          <div className="skills-grid">
            {card.skills?.map((skill) => (
              <article className="skill-card" key={`${skill.name}-${skill.description}`}>
                <Sparkles size={16} />
                <div>
                  <strong>{skill.name || 'Unnamed skill'}</strong>
                  <p>{skill.description || 'No description provided.'}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <Bot size={28} />
          <p>Fetch an agent card to inspect skills and compliance status.</p>
        </div>
      )}
    </section>
  )
}
