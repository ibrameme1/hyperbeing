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
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-2xl flex items-center justify-center self-end"
             style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
          <Sparkles size={14} className="text-white" />
        </div>
      )}

      <div className={`max-w-[78%] flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Image attachments */}
        {attachments.filter(a => a.type === 'image').map((att, i) => (
          <img
            key={i}
            src={att.data}
            alt={att.name}
            className="max-h-40 rounded-2xl object-cover shadow-ios"
          />
        ))}

        {/* Text */}
        {text && (
          <div className={isUser ? 'bubble-user' : 'bubble-ai'}>
            {text.split('\n').map((line, i, arr) => (
              <span key={i}>
                {line}
                {i < arr.length - 1 && <br />}
              </span>
            ))}
            {message.streaming && (
              <span className="inline-block w-0.5 h-4 ml-0.5 bg-current align-middle animate-pulse" />
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
