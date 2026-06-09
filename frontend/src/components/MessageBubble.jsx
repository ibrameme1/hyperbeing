import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const attachments = message.attachments || [];
  const text = typeof message.content === 'string' ? message.content : message.content;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      style={{ display: 'flex', gap: 12, flexDirection: isUser ? 'row-reverse' : 'row' }}
    >
      {/* Avatar */}
      {!isUser && (
        <div
          style={{
            flexShrink: 0,
            width: 32,
            height: 32,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'flex-end',
            background: '#5B50FF',
          }}
        >
          <Sparkles size={14} style={{ color: '#ffffff' }} />
        </div>
      )}

      <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: 8, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
        {/* Image attachments */}
        {attachments.filter(a => a.type === 'image').map((att, i) => (
          <img
            key={i}
            src={att.data}
            alt={att.name}
            style={{ maxHeight: 160, borderRadius: 12, objectFit: 'cover' }}
          />
        ))}

        {/* Text */}
        {text && (
          <div
            style={isUser ? {
              background: '#5B50FF',
              color: '#ffffff',
              borderRadius: '12px 12px 4px 12px',
              padding: '10px 14px',
              fontFamily: 'Inter,sans-serif',
              fontSize: 14,
              lineHeight: 1.5,
            } : {
              background: '#141414',
              color: '#b8b8b8',
              border: '0.5px solid #1e1e1e',
              borderRadius: '12px 12px 12px 4px',
              padding: '10px 14px',
              fontFamily: 'Inter,sans-serif',
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {text.split('\n').map((line, i, arr) => (
              <span key={i}>
                {line}
                {i < arr.length - 1 && <br />}
              </span>
            ))}
            {message.streaming && (
              <span style={{ display: 'inline-block', width: 2, height: 16, marginLeft: 2, background: 'currentColor', verticalAlign: 'middle' }} className="animate-pulse" />
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
