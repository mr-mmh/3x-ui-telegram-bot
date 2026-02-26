import { type Bot, type Context, type SessionFlavor } from "grammy";
import {
    type Conversation,
    type ConversationBuilder,
    type ConversationFlavor,
} from "@grammyjs/conversations";

type BotContextWithSession = Context & SessionFlavor<{}>;

export type BotContext = BotContextWithSession &
    ConversationFlavor<BotContextWithSession>;
export type BotConversation = Conversation<BotContext, BotContext>;
export type BotType = Bot<BotContext>;
export type BotConversationBuilder = ConversationBuilder<
    BotContext,
    BotContext
>;
