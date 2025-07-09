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
    @get info(): OkResponse & Info;

    @get
    @route("/users/{id}/settings")
    users(@path id: string): void;

    @get
    @route("/users/{uid}/info")
    userInfo(@path uid: string): void;
}
