import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import type { AuthCredentials, AuthResponse, ConversationSummary, ErrorResponse, HealthStatus, SendMessageBody, StoredMessage } from "./api.schemas";
import { customFetch } from "../custom-fetch";
import type { ErrorType, BodyType } from "../custom-fetch";
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
/**
 * @summary Health check
 */
export declare const getHealthCheckUrl: () => string;
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Sign up
 */
export declare const getSignupUrl: () => string;
export declare const signup: (authCredentials: AuthCredentials, options?: RequestInit) => Promise<AuthResponse>;
export declare const getSignupMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof signup>>, TError, {
        data: BodyType<AuthCredentials>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof signup>>, TError, {
    data: BodyType<AuthCredentials>;
}, TContext>;
export type SignupMutationResult = NonNullable<Awaited<ReturnType<typeof signup>>>;
export type SignupMutationBody = BodyType<AuthCredentials>;
export type SignupMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Sign up
 */
export declare const useSignup: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof signup>>, TError, {
        data: BodyType<AuthCredentials>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof signup>>, TError, {
    data: BodyType<AuthCredentials>;
}, TContext>;
/**
 * @summary Login
 */
export declare const getLoginUrl: () => string;
export declare const login: (authCredentials: AuthCredentials, options?: RequestInit) => Promise<AuthResponse>;
export declare const getLoginMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof login>>, TError, {
        data: BodyType<AuthCredentials>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof login>>, TError, {
    data: BodyType<AuthCredentials>;
}, TContext>;
export type LoginMutationResult = NonNullable<Awaited<ReturnType<typeof login>>>;
export type LoginMutationBody = BodyType<AuthCredentials>;
export type LoginMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Login
 */
export declare const useLogin: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof login>>, TError, {
        data: BodyType<AuthCredentials>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof login>>, TError, {
    data: BodyType<AuthCredentials>;
}, TContext>;
/**
 * @summary Send a message (saves to DB)
 */
export declare const getSendMessageUrl: () => string;
export declare const sendMessage: (sendMessageBody: SendMessageBody, options?: RequestInit) => Promise<StoredMessage>;
export declare const getSendMessageMutationOptions: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof sendMessage>>, TError, {
        data: BodyType<SendMessageBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof sendMessage>>, TError, {
    data: BodyType<SendMessageBody>;
}, TContext>;
export type SendMessageMutationResult = NonNullable<Awaited<ReturnType<typeof sendMessage>>>;
export type SendMessageMutationBody = BodyType<SendMessageBody>;
export type SendMessageMutationError = ErrorType<ErrorResponse>;
/**
 * @summary Send a message (saves to DB)
 */
export declare const useSendMessage: <TError = ErrorType<ErrorResponse>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof sendMessage>>, TError, {
        data: BodyType<SendMessageBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof sendMessage>>, TError, {
    data: BodyType<SendMessageBody>;
}, TContext>;
/**
 * @summary Get all conversations for the authenticated user
 */
export declare const getGetConversationsUrl: () => string;
export declare const getConversations: (options?: RequestInit) => Promise<ConversationSummary[]>;
export declare const getGetConversationsQueryKey: () => readonly ["/api/messages/conversations"];
export declare const getGetConversationsQueryOptions: <TData = Awaited<ReturnType<typeof getConversations>>, TError = ErrorType<ErrorResponse>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getConversations>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getConversations>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetConversationsQueryResult = NonNullable<Awaited<ReturnType<typeof getConversations>>>;
export type GetConversationsQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get all conversations for the authenticated user
 */
export declare function useGetConversations<TData = Awaited<ReturnType<typeof getConversations>>, TError = ErrorType<ErrorResponse>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getConversations>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Get messages between authenticated user and another user
 */
export declare const getGetMessagesUrl: (otherUser: string) => string;
export declare const getMessages: (otherUser: string, options?: RequestInit) => Promise<StoredMessage[]>;
export declare const getGetMessagesQueryKey: (otherUser: string) => readonly [`/api/messages/${string}`];
export declare const getGetMessagesQueryOptions: <TData = Awaited<ReturnType<typeof getMessages>>, TError = ErrorType<ErrorResponse>>(otherUser: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMessages>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getMessages>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetMessagesQueryResult = NonNullable<Awaited<ReturnType<typeof getMessages>>>;
export type GetMessagesQueryError = ErrorType<ErrorResponse>;
/**
 * @summary Get messages between authenticated user and another user
 */
export declare function useGetMessages<TData = Awaited<ReturnType<typeof getMessages>>, TError = ErrorType<ErrorResponse>>(otherUser: string, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getMessages>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export {};
//# sourceMappingURL=api.d.ts.map