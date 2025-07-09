import "@typespec/http";

@service(#{ title: "My Service" })
namespace MyService;

using TypeSpec.Http;

/**
 * Information about the service.
 */
model Info {
    /**
     * The message of the day.
     */
    motd: string;
}

model User {
    name: string;
}

@route("/hello")
interface Operations {
    /**
     * Gets information about the service.
     */
    @get info(): OkResponse & Info;

    @get
    @route("/users/{id}/settings")
    users(@path id: string): void;

    @get
    @route("/users/{uid}/info")
    userInfo(@path uid: string): OkResponse & Info;

    @sharedRoute
    @route("/foo/{baz}")
    @get
    foo(@header `x-test`: "foo", @path baz: string): OkResponse;

    @sharedRoute
    @route("/foo/{qux}")
    @get
    bar(@header `x-test`: "bar", @path qux: string): OkResponse;
}
